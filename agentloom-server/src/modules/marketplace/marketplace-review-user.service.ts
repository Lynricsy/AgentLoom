import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import { SubmitReviewSchema } from './dto/marketplace.dto';
import {
  MarketplaceListingNotFoundException,
  MarketplaceReviewConflictException,
} from './marketplace.exceptions';

interface MarketplaceReviewAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MarketplaceUserReviewItem {
  id: string;
  listingId: string;
  rating: number;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: MarketplaceReviewAuthor;
}

export interface MarketplaceListingReviewsResult {
  data: MarketplaceUserReviewItem[];
  total: number;
  page: number;
  pageSize: number;
}

function buildReviewAuthor(params: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}): MarketplaceReviewAuthor {
  return {
    id: params.id,
    displayName: params.displayName ?? '未知用户',
    avatarUrl: params.avatarUrl,
  };
}

@Injectable()
export class MarketplaceReviewUserService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async submitReview(userId: string, listingId: string, dto: unknown) {
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
    page = 1,
    pageSize = 20,
  ): Promise<MarketplaceListingReviewsResult> {
    await this.ensureListedListingExists(listingId);

    const normalizedPage =
      Number.isFinite(Number(page)) && Number(page) > 0 ? Math.trunc(Number(page)) : 1;
    const normalizedPageSize = Math.min(
      100,
      Number.isFinite(Number(pageSize)) && Number(pageSize) > 0
        ? Math.trunc(Number(pageSize))
        : 20,
    );
    const offset = (normalizedPage - 1) * normalizedPageSize;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: schema.marketplaceReviews.id,
          listingId: schema.marketplaceReviews.listingId,
          rating: schema.marketplaceReviews.rating,
          content: schema.marketplaceReviews.content,
          createdAt: schema.marketplaceReviews.createdAt,
          updatedAt: schema.marketplaceReviews.updatedAt,
          authorId: schema.marketplaceReviews.userId,
          authorDisplayName:
            sql<string | null>`coalesce(${schema.users.displayName}, ${schema.users.email})`,
          authorAvatarUrl: schema.users.avatarUrl,
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
        listingId: review.listingId,
        rating: review.rating,
        content: review.content,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        author: buildReviewAuthor({
          id: review.authorId,
          displayName: review.authorDisplayName,
          avatarUrl: review.authorAvatarUrl,
        }),
      })),
      total: countResult[0]?.count ?? 0,
      page: normalizedPage,
      pageSize: normalizedPageSize,
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

  private async findReviewById(reviewId: string): Promise<MarketplaceUserReviewItem> {
    const [review] = await this.db
      .select({
        id: schema.marketplaceReviews.id,
        listingId: schema.marketplaceReviews.listingId,
        rating: schema.marketplaceReviews.rating,
        content: schema.marketplaceReviews.content,
        createdAt: schema.marketplaceReviews.createdAt,
        updatedAt: schema.marketplaceReviews.updatedAt,
        authorId: schema.marketplaceReviews.userId,
        authorDisplayName:
          sql<string | null>`coalesce(${schema.users.displayName}, ${schema.users.email})`,
        authorAvatarUrl: schema.users.avatarUrl,
      })
      .from(schema.marketplaceReviews)
      .leftJoin(schema.users, eq(schema.marketplaceReviews.userId, schema.users.id))
      .where(eq(schema.marketplaceReviews.id, reviewId));

    if (!review) {
      throw new Error(`Marketplace review ${reviewId} 不存在`);
    }

    return {
      id: review.id,
      listingId: review.listingId,
      rating: review.rating,
      content: review.content,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      author: buildReviewAuthor({
        id: review.authorId,
        displayName: review.authorDisplayName,
        avatarUrl: review.authorAvatarUrl,
      }),
    };
  }
}
