import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import * as schema from '../../database/schema';
import type {
  MarketplaceListing,
  MarketplaceReviewResult,
  WorkflowVersionSnapshot,
} from '../../database/schema';
import { WorkflowVersionService } from '../workflow-definition/workflow-version.service';
import type {
  QueryPublicListingsDto,
  QueryMyListingsDto,
  SubmitMarketplaceListingDto,
} from './dto/marketplace.dto';
import {
  InstallMarketplaceListingSchema,
  QueryMyListingsSchema,
  QueryPublicListingsSchema,
} from './dto/marketplace.dto';
import {
  MarketplaceListingConflictException,
  MarketplaceListingNotFoundException,
  MarketplaceWorkflowVersionNotFoundException,
} from './marketplace.exceptions';
import { MarketplaceReviewService } from './marketplace-review.service';

const DEFAULT_VIEWPORT: schema.ReactFlowViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

interface MarketplacePublicAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MarketplacePublicReviewItem {
  id: string;
  rating: number;
  content: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: MarketplacePublicAuthor;
}

export interface PublicMarketplaceListingItem {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl: string | null;
  category: MarketplaceListing['category'];
  useCount: number;
  avgRating: string | null;
  reviewCount: number;
  publishedAt: Date | null;
  author: MarketplacePublicAuthor;
}

export interface PublicMarketplaceListingsResult {
  data: PublicMarketplaceListingItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicMarketplaceListingDetail
  extends PublicMarketplaceListingItem {
  workflowVersionId: string;
  definition: {
    nodes: schema.ReactFlowNode[];
    edges: schema.ReactFlowEdge[];
    viewport: schema.ReactFlowViewport;
    inputSchema: WorkflowVersionSnapshot['inputSchema'] | null;
  };
  reviews: MarketplacePublicReviewItem[];
}

function buildMarketplaceAuthor(params: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}): MarketplacePublicAuthor {
  return {
    id: params.id,
    displayName: params.displayName ?? '未知用户',
    avatarUrl: params.avatarUrl,
  };
}

function normalizeViewport(
  viewport: schema.ReactFlowViewport | null | undefined,
): schema.ReactFlowViewport {
  return viewport ?? DEFAULT_VIEWPORT;
}

export interface MyMarketplaceListingItem {
  id: string;
  workflowVersionId: string;
  tenantId: string;
  title: string;
  summary: string;
  tags: string[];
  coverImageUrl: string | null;
  category: MarketplaceListing['category'];
  useCount: number;
  avgRating: string | null;
  reviewCount: number;
  status: MarketplaceListing['status'];
  reviewResult: MarketplaceReviewResult | null;
  submittedBy: string;
  submittedAt: Date;
  publishedAt: Date | null;
  unlistedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  workflowDefinitionId: string | null;
  workflowName: string | null;
  versionNumber: number | null;
}

export interface MyListingsResult {
  data: MyMarketplaceListingItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly reviewService: MarketplaceReviewService,
    private readonly workflowVersionService: WorkflowVersionService,
  ) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  async submit(
    tenantId: string,
    userId: string,
    dto: SubmitMarketplaceListingDto,
  ): Promise<{ listing: MarketplaceListing; reviewResult: MarketplaceReviewResult }> {
    const { workflowVersionId, title, summary, tags, coverImageUrl, category } = dto;

    const existing = await this.findByVersionId(workflowVersionId);

    if (existing) {
      if (existing.status === 'listed') {
        throw new MarketplaceListingConflictException(
          '该工作流版本已上架，请先下架后重新提交',
          existing.status,
        );
      }
      if (existing.status === 'pending_review') {
        throw new MarketplaceListingConflictException(
          '该工作流版本正在审查中，请等待审查完成',
          existing.status,
        );
      }

      await this.ensureWorkflowVersionExists(workflowVersionId);

      return this.resubmit(tenantId, existing.id, userId, {
        title,
        summary,
        tags,
        coverImageUrl,
        category,
        workflowVersionId,
      });
    }

    await this.ensureWorkflowVersionExists(workflowVersionId);

    return this.createAndReview(tenantId, userId, {
      workflowVersionId,
      title,
      summary,
      tags,
      coverImageUrl,
      category,
    });
  }

  async unlist(
    tenantId: string,
    listingId: string,
    userId: string,
  ): Promise<MarketplaceListing> {
    const listing = await this.findByIdOrThrow(tenantId, listingId);

    if (listing.status !== 'listed') {
      throw new MarketplaceListingConflictException(
        `仅已上架的 listing 可以下架，当前状态: ${listing.status}`,
        listing.status,
      );
    }

    const [updated] = await this.tenantDb
      .update(schema.marketplaceListings)
      .set({
        status: 'unlisted',
        unlistedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.marketplaceListings.id, listingId),
          eq(schema.marketplaceListings.tenantId, tenantId),
        ),
      )
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'marketplace_listing_unlisted',
        listingId,
        tenantId,
        userId,
      }),
    );

    return updated;
  }

  async relist(
    tenantId: string,
    listingId: string,
    userId: string,
  ): Promise<{ listing: MarketplaceListing; reviewResult: MarketplaceReviewResult }> {
    const listing = await this.findByIdOrThrow(tenantId, listingId);

    if (listing.status !== 'unlisted') {
      throw new MarketplaceListingConflictException(
        `仅已下架的 listing 可以重新上架，当前状态: ${listing.status}`,
        listing.status,
      );
    }

    await this.tenantDb
      .update(schema.marketplaceListings)
      .set({ status: 'pending_review', updatedAt: new Date() })
      .where(eq(schema.marketplaceListings.id, listingId));

    const reviewResult = await this.reviewService.review(
      tenantId,
      listing.workflowVersionId,
      {
        title: listing.title,
        summary: listing.summary,
        tags: listing.tags,
      },
    );

    const newStatus =
      reviewResult.outcome === 'passed' ? 'listed' : 'review_failed';

    const [updated] = await this.tenantDb
      .update(schema.marketplaceListings)
      .set({
        status: newStatus,
        reviewResult,
        publishedAt: newStatus === 'listed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.marketplaceListings.id, listingId))
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'marketplace_listing_relisted',
        listingId,
        tenantId,
        userId,
        outcome: reviewResult.outcome,
      }),
    );

    return { listing: updated, reviewResult };
  }

  async findMyListings(
    tenantId: string,
    query: QueryMyListingsDto,
  ): Promise<MyListingsResult> {
    const parsedQuery = QueryMyListingsSchema.parse(query);
    const { page, pageSize, status } = parsedQuery;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(schema.marketplaceListings.tenantId, tenantId),
    ];

    if (status) {
      conditions.push(eq(schema.marketplaceListings.status, status));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.tenantDb
        .select({
          id: schema.marketplaceListings.id,
          workflowVersionId: schema.marketplaceListings.workflowVersionId,
          tenantId: schema.marketplaceListings.tenantId,
          title: schema.marketplaceListings.title,
          summary: schema.marketplaceListings.summary,
          tags: schema.marketplaceListings.tags,
          coverImageUrl: schema.marketplaceListings.coverImageUrl,
          category: schema.marketplaceListings.category,
          useCount: schema.marketplaceListings.useCount,
          avgRating: schema.marketplaceListings.avgRating,
          reviewCount: schema.marketplaceListings.reviewCount,
          status: schema.marketplaceListings.status,
          reviewResult: schema.marketplaceListings.reviewResult,
          submittedBy: schema.marketplaceListings.submittedBy,
          submittedAt: schema.marketplaceListings.submittedAt,
          publishedAt: schema.marketplaceListings.publishedAt,
          unlistedAt: schema.marketplaceListings.unlistedAt,
          createdAt: schema.marketplaceListings.createdAt,
          updatedAt: schema.marketplaceListings.updatedAt,
          workflowDefinitionId: schema.workflowVersions.workflowDefinitionId,
          workflowName: schema.workflowDefinitions.name,
          versionNumber: schema.workflowVersions.versionNumber,
        })
        .from(schema.marketplaceListings)
        .leftJoin(
          schema.workflowVersions,
          eq(
            schema.marketplaceListings.workflowVersionId,
            schema.workflowVersions.id,
          ),
        )
        .leftJoin(
          schema.workflowDefinitions,
          eq(
            schema.workflowVersions.workflowDefinitionId,
            schema.workflowDefinitions.id,
          ),
        )
        .where(whereClause)
        .orderBy(desc(schema.marketplaceListings.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.tenantDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.marketplaceListings)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findById(
    tenantId: string,
    listingId: string,
  ): Promise<MarketplaceListing> {
    return this.findByIdOrThrow(tenantId, listingId);
  }

  async findPublicListings(
    query: unknown,
  ): Promise<PublicMarketplaceListingsResult> {
    const parsedQuery = QueryPublicListingsSchema.parse(query);
    const { category, search, sort, page, pageSize } = parsedQuery;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(schema.marketplaceListings.status, 'listed')];

    if (category) {
      conditions.push(eq(schema.marketplaceListings.category, category));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      const searchCondition = or(
        ilike(schema.marketplaceListings.title, searchTerm),
        ilike(schema.marketplaceListings.summary, searchTerm),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = and(...conditions);

    const selectQuery = this.db
      .select({
        id: schema.marketplaceListings.id,
        title: schema.marketplaceListings.title,
        summary: schema.marketplaceListings.summary,
        tags: schema.marketplaceListings.tags,
        coverImageUrl: schema.marketplaceListings.coverImageUrl,
        category: schema.marketplaceListings.category,
        useCount: schema.marketplaceListings.useCount,
        avgRating: schema.marketplaceListings.avgRating,
        reviewCount: schema.marketplaceListings.reviewCount,
        publishedAt: schema.marketplaceListings.publishedAt,
        authorId: schema.marketplaceListings.submittedBy,
        authorDisplayName:
          sql<string | null>`coalesce(${schema.users.displayName}, ${schema.users.email})`,
        authorAvatarUrl: schema.users.avatarUrl,
      })
      .from(schema.marketplaceListings)
      .leftJoin(
        schema.users,
        eq(schema.marketplaceListings.submittedBy, schema.users.id),
      )
      .where(whereClause);

    const orderedQuery =
      sort === 'rating'
        ? selectQuery.orderBy(
            sql`${schema.marketplaceListings.avgRating} DESC NULLS LAST`,
            desc(schema.marketplaceListings.reviewCount),
            desc(schema.marketplaceListings.publishedAt),
          )
        : sort === 'newest'
          ? selectQuery.orderBy(
              desc(schema.marketplaceListings.publishedAt),
              desc(schema.marketplaceListings.createdAt),
            )
          : selectQuery.orderBy(
              desc(schema.marketplaceListings.useCount),
              desc(schema.marketplaceListings.reviewCount),
              desc(schema.marketplaceListings.publishedAt),
            );

    const [data, countResult] = await Promise.all([
      orderedQuery.limit(pageSize).offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.marketplaceListings)
        .where(whereClause),
    ]);

    return {
      data: data.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        tags: item.tags,
        coverImageUrl: item.coverImageUrl,
        category: item.category,
        useCount: item.useCount,
        avgRating: item.avgRating,
        reviewCount: item.reviewCount,
        publishedAt: item.publishedAt,
        author: buildMarketplaceAuthor({
          id: item.authorId,
          displayName: item.authorDisplayName,
          avatarUrl: item.authorAvatarUrl,
        }),
      })),
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async findPublicById(id: string): Promise<PublicMarketplaceListingDetail> {
    const listing = await this.findPublicListingWithSnapshotOrThrow(id);
    const reviews = await this.fetchPublicReviews(id);

    return {
      id: listing.id,
      workflowVersionId: listing.workflowVersionId,
      title: listing.title,
      summary: listing.summary,
      tags: listing.tags,
      coverImageUrl: listing.coverImageUrl,
      category: listing.category,
      useCount: listing.useCount,
      avgRating: listing.avgRating,
      reviewCount: listing.reviewCount,
      publishedAt: listing.publishedAt,
      author: buildMarketplaceAuthor({
        id: listing.authorId,
        displayName: listing.authorDisplayName,
        avatarUrl: listing.authorAvatarUrl,
      }),
      definition: {
        nodes: listing.snapshot.nodes,
        edges: listing.snapshot.edges,
        viewport: normalizeViewport(listing.snapshot.viewport),
        inputSchema: listing.snapshot.inputSchema ?? null,
      },
      reviews,
    };
  }

  async installListing(
    tenantId: string,
    userId: string,
    listingId: string,
    dto: unknown,
  ) {
    const parsedDto = InstallMarketplaceListingSchema.parse(dto);
    const listing = await this.findPublicListingWithSnapshotOrThrow(listingId);

    const createdWorkflow = await this.workflowVersionService.create(
      tenantId,
      userId,
      {
        name: parsedDto.name ?? listing.title,
        description: parsedDto.description ?? listing.summary,
        marketplace_listing_id: listingId,
      },
    );

    await this.db
      .update(schema.marketplaceListings)
      .set({
        useCount: sql`${schema.marketplaceListings.useCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.marketplaceListings.id, listingId));

    this.logger.log(
      JSON.stringify({
        action: 'marketplace_listing_installed',
        listingId,
        tenantId,
        userId,
        workflowId: createdWorkflow.id,
      }),
    );

    return createdWorkflow;
  }

  private async createAndReview(
    tenantId: string,
    userId: string,
    params: {
      workflowVersionId: string;
      title: string;
      summary: string;
      tags: string[];
      coverImageUrl?: string;
      category?: MarketplaceListing['category'];
    },
  ): Promise<{ listing: MarketplaceListing; reviewResult: MarketplaceReviewResult }> {
    const [created] = await this.tenantDb
      .insert(schema.marketplaceListings)
      .values({
        workflowVersionId: params.workflowVersionId,
        tenantId,
        title: params.title,
        summary: params.summary,
        tags: params.tags,
        coverImageUrl: params.coverImageUrl ?? null,
        category: params.category ?? null,
        status: 'pending_review',
        submittedBy: userId,
        submittedAt: new Date(),
      })
      .returning();

    const reviewResult = await this.reviewService.review(tenantId, params.workflowVersionId, {
      title: params.title,
      summary: params.summary,
      tags: params.tags,
    });

    const newStatus =
      reviewResult.outcome === 'passed' ? 'listed' : 'review_failed';

    const [updated] = await this.tenantDb
      .update(schema.marketplaceListings)
      .set({
        status: newStatus,
        reviewResult,
        publishedAt: newStatus === 'listed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.marketplaceListings.id, created.id))
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'marketplace_listing_submitted',
        listingId: updated.id,
        workflowVersionId: params.workflowVersionId,
        tenantId,
        userId,
        outcome: reviewResult.outcome,
      }),
    );

    return { listing: updated, reviewResult };
  }

  private async resubmit(
    tenantId: string,
    listingId: string,
    userId: string,
    params: {
      title: string;
      summary: string;
      tags: string[];
      coverImageUrl?: string;
      category?: MarketplaceListing['category'];
      workflowVersionId: string;
    },
  ): Promise<{ listing: MarketplaceListing; reviewResult: MarketplaceReviewResult }> {
    await this.tenantDb
      .update(schema.marketplaceListings)
      .set({
        title: params.title,
        summary: params.summary,
        tags: params.tags,
        coverImageUrl: params.coverImageUrl ?? null,
        category: params.category ?? null,
        status: 'pending_review',
        submittedBy: userId,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.marketplaceListings.id, listingId),
          eq(schema.marketplaceListings.tenantId, tenantId),
        ),
      );

    const reviewResult = await this.reviewService.review(
      tenantId,
      params.workflowVersionId,
      {
        title: params.title,
        summary: params.summary,
        tags: params.tags,
      },
    );

    const newStatus =
      reviewResult.outcome === 'passed' ? 'listed' : 'review_failed';

    const [updated] = await this.tenantDb
      .update(schema.marketplaceListings)
      .set({
        status: newStatus,
        reviewResult,
        publishedAt: newStatus === 'listed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.marketplaceListings.id, listingId))
      .returning();

    this.logger.log(
      JSON.stringify({
        action: 'marketplace_listing_resubmitted',
        listingId,
        tenantId,
        userId,
        outcome: reviewResult.outcome,
      }),
    );

    return { listing: updated, reviewResult };
  }

  private async findByVersionId(
    workflowVersionId: string,
  ): Promise<MarketplaceListing | undefined> {
    const [listing] = await this.tenantDb
      .select()
      .from(schema.marketplaceListings)
      .where(
        eq(schema.marketplaceListings.workflowVersionId, workflowVersionId),
      );

    return listing;
  }

  private async ensureWorkflowVersionExists(
    workflowVersionId: string,
  ): Promise<void> {
    const [version] = await this.tenantDb
      .select({
        id: schema.workflowVersions.id,
      })
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, workflowVersionId));

    if (!version) {
      throw new MarketplaceWorkflowVersionNotFoundException(workflowVersionId);
    }
  }

  private async findByIdOrThrow(
    tenantId: string,
    listingId: string,
  ): Promise<MarketplaceListing> {
    const [listing] = await this.tenantDb
      .select()
      .from(schema.marketplaceListings)
      .where(
        and(
          eq(schema.marketplaceListings.id, listingId),
          eq(schema.marketplaceListings.tenantId, tenantId),
        ),
      );

    if (!listing) {
      throw new MarketplaceListingNotFoundException(listingId);
    }

    return listing;
  }

  private async findPublicListingWithSnapshotOrThrow(listingId: string) {
    const [listing] = await this.db
      .select({
        id: schema.marketplaceListings.id,
        workflowVersionId: schema.marketplaceListings.workflowVersionId,
        title: schema.marketplaceListings.title,
        summary: schema.marketplaceListings.summary,
        tags: schema.marketplaceListings.tags,
        coverImageUrl: schema.marketplaceListings.coverImageUrl,
        category: schema.marketplaceListings.category,
        useCount: schema.marketplaceListings.useCount,
        avgRating: schema.marketplaceListings.avgRating,
        reviewCount: schema.marketplaceListings.reviewCount,
        publishedAt: schema.marketplaceListings.publishedAt,
        authorId: schema.marketplaceListings.submittedBy,
        authorDisplayName:
          sql<string | null>`coalesce(${schema.users.displayName}, ${schema.users.email})`,
        authorAvatarUrl: schema.users.avatarUrl,
        snapshot: schema.workflowVersions.snapshot,
      })
      .from(schema.marketplaceListings)
      .innerJoin(
        schema.workflowVersions,
        eq(
          schema.marketplaceListings.workflowVersionId,
          schema.workflowVersions.id,
        ),
      )
      .leftJoin(
        schema.users,
        eq(schema.marketplaceListings.submittedBy, schema.users.id),
      )
      .where(
        and(
          eq(schema.marketplaceListings.id, listingId),
          eq(schema.marketplaceListings.status, 'listed'),
        ),
      );

    if (!listing) {
      throw new MarketplaceListingNotFoundException(listingId);
    }

    return listing;
  }

  private async fetchPublicReviews(
    listingId: string,
  ): Promise<MarketplacePublicReviewItem[]> {
    const reviews = await this.db
      .select({
        id: schema.marketplaceReviews.id,
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
      .leftJoin(
        schema.users,
        eq(schema.marketplaceReviews.userId, schema.users.id),
      )
      .where(eq(schema.marketplaceReviews.listingId, listingId))
      .orderBy(desc(schema.marketplaceReviews.createdAt));

    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      content: review.content,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      author: buildMarketplaceAuthor({
        id: review.authorId,
        displayName: review.authorDisplayName,
        avatarUrl: review.authorAvatarUrl,
      }),
    }));
  }
}
