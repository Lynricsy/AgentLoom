import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import {
  QueryPublicReviewsSchema,
  SubmitReviewSchema,
} from './dto/marketplace.dto';
import {
  MarketplaceListingNotFoundException,
  MarketplaceReviewConflictException,
} from './marketplace.exceptions';

interface MarketplaceReviewAuthor {
  displayName: string;
}

export interface MarketplaceUserReviewItem {
  id: string;
  rating: number;
  content: string | null;
  createdAt: Date;
  author: MarketplaceReviewAuthor;
}

export interface MarketplaceListingReviewsResult {
  data: MarketplaceUserReviewItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface MarketplaceSubmittedReviewItem {
  id: string;
  rating: number;
  content: string | null;
  createdAt: Date;
}

function buildReviewAuthor(params: {
  displayName: string | null;
}): MarketplaceReviewAuthor {
  return {
    displayName: params.displayName ?? '未知用户',
  };
}

@Injectable()
export class MarketplaceReviewUserService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async submitReview(
    userId: string,
    listingId: string,
    dto: unknown,
  ): Promise<MarketplaceSubmittedReviewItem> {
    const parsedDto = SubmitReviewSchema.parse(dto);

    await this.ensureListedListingExists(listingId);

    try {
      const [created] = await this.db
        .insert(schema.marketplaceReviews)
        .values({
          listingId,
          userId,
          rating: parsedDto.rating,
          content: parsedDto.content || null,
        })
        .returning();

      await this.recalculateRating(listingId);

      return this.findReviewById(created.id);
    } catch (error: unknown) {
      const errorCode =
        error instanceof Error && 'code' in error
          ? (error as Record<string, unknown>).code
          : error instanceof Error &&
              'cause' in error &&
              typeof error.cause === 'object' &&
              error.cause !== null &&
              'code' in error.cause
            ? (error.cause as Record<string, unknown>).code
            : undefined;
      const isUniqueViolation =
        error instanceof Error && errorCode === '23505';

      if (isUniqueViolation) {
        throw new MarketplaceReviewConflictException();
      }

      throw error;
    }
  }

  async findReviewsByListing(
    listingId: string,
    query: unknown,
  ): Promise<MarketplaceListingReviewsResult> {
    await this.ensureListedListingExists(listingId);

    const parsedQuery = QueryPublicReviewsSchema.parse(query);
    const { page, pageSize } = parsedQuery;
    const normalizedPage = page;
    const normalizedPageSize = pageSize;
    const offset = (normalizedPage - 1) * normalizedPageSize;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: schema.marketplaceReviews.id,
          rating: schema.marketplaceReviews.rating,
          content: schema.marketplaceReviews.content,
          createdAt: schema.marketplaceReviews.createdAt,
          authorDisplayName:
            sql<string | null>`coalesce(${schema.users.displayName}, ${schema.users.email})`,
        })
        .from(schema.marketplaceReviews)
        .leftJoin(schema.users, eq(schema.marketplaceReviews.userId, schema.users.id))
        .where(eq(schema.marketplaceReviews.listingId, listingId))
        .orderBy(desc(schema.marketplaceReviews.createdAt))
        .limit(normalizedPageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.marketplaceReviews)
        .where(eq(schema.marketplaceReviews.listingId, listingId)),
    ]);

    return {
      data: data.map((review) => ({
        id: review.id,
        rating: review.rating,
        content: review.content,
        createdAt: review.createdAt,
        author: buildReviewAuthor({
          displayName: review.authorDisplayName,
        }),
      })),
      meta: {
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total: countResult[0]?.count ?? 0,
        totalPages:
          (countResult[0]?.count ?? 0) === 0
            ? 0
            : Math.ceil((countResult[0]?.count ?? 0) / normalizedPageSize),
      },
    };
  }

  async recalculateRating(listingId: string): Promise<void> {
    const [aggregate] = await this.db
      .select({
        avgRating: sql<string | null>`avg(${schema.marketplaceReviews.rating})::numeric(3,2)`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(schema.marketplaceReviews)
      .where(eq(schema.marketplaceReviews.listingId, listingId));

    await this.db
      .update(schema.marketplaceListings)
      .set({
        avgRating: aggregate?.avgRating ?? null,
        reviewCount: aggregate?.reviewCount ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(schema.marketplaceListings.id, listingId));
  }

  private async ensureListedListingExists(listingId: string): Promise<void> {
    const [listing] = await this.db
      .select({ id: schema.marketplaceListings.id })
      .from(schema.marketplaceListings)
      .where(
        and(
          eq(schema.marketplaceListings.id, listingId),
          eq(schema.marketplaceListings.status, 'listed'),
        ),
      );

    if (!listing) {
      throw new MarketplaceListingNotFoundException(listingId);
    }
  }

  private async findReviewById(
    reviewId: string,
  ): Promise<MarketplaceSubmittedReviewItem> {
    const [review] = await this.db
      .select({
        id: schema.marketplaceReviews.id,
        rating: schema.marketplaceReviews.rating,
        content: schema.marketplaceReviews.content,
        createdAt: schema.marketplaceReviews.createdAt,
      })
      .from(schema.marketplaceReviews)
      .where(eq(schema.marketplaceReviews.id, reviewId));

    if (!review) {
      throw new Error(`Marketplace review ${reviewId} 不存在`);
    }

    return {
      id: review.id,
      rating: review.rating,
      content: review.content,
      createdAt: review.createdAt,
    };
  }
}
