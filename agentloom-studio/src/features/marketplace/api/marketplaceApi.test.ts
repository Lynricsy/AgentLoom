import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMarketplaceListingById,
  fetchMyMarketplaceListings,
  relistMarketplaceListing,
  submitMarketplaceListing,
  unlistMarketplaceListing,
} from './marketplaceApi';

const { getMock, postMock, toSnakeBodyMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  toSnakeBodyMock: vi.fn((value: unknown) => value),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
  toSnakeBody: (value: unknown) => toSnakeBodyMock(value),
}));

describe('marketplaceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a marketplace listing with snake-cased body payload', async () => {
    const request = {
      workflowVersionId: 'version-1',
      title: 'Agent 工作流模板',
      summary: '这是一个满足 marketplace 审查要求的工作流摘要描述。',
      tags: ['agent', 'automation'],
      coverImageUrl: 'https://example.com/cover.png',
    };
    const response = {
      data: { id: 'listing-1', title: request.title },
      reviewResult: { outcome: 'passed', checks: [], reviewedAt: '2026-03-15T00:00:00.000Z' },
    };
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    });

    const result = await submitMarketplaceListing(request);

    expect(toSnakeBodyMock).toHaveBeenCalledWith(request);
    expect(postMock).toHaveBeenCalledWith('marketplace/listings', {
      json: request,
    });
    expect(result).toEqual(response);
  });

  it('posts unlist request for a listing', async () => {
    const response = {
      data: { id: 'listing-1', status: 'unlisted' },
    };
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    });

    const result = await unlistMarketplaceListing('listing-1');

    expect(postMock).toHaveBeenCalledWith(
      'marketplace/listings/listing-1/unlist',
    );
    expect(result).toEqual(response);
  });

  it('posts relist request for a listing', async () => {
    const response = {
      data: { id: 'listing-1', status: 'listed' },
      reviewResult: { outcome: 'passed', checks: [], reviewedAt: '2026-03-15T00:00:00.000Z' },
    };
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    });

    const result = await relistMarketplaceListing('listing-1');

    expect(postMock).toHaveBeenCalledWith(
      'marketplace/listings/listing-1/relist',
    );
    expect(result).toEqual(response);
  });

  it('fetches my marketplace listings with filters', async () => {
    const response = {
      data: [],
      meta: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    };
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    });

    const result = await fetchMyMarketplaceListings({
      page: 2,
      pageSize: 10,
      status: 'listed',
    });

    expect(getMock).toHaveBeenCalledWith('marketplace/my-listings', {
      searchParams: {
        page: '2',
        pageSize: '10',
        status: 'listed',
      },
    });
    expect(result).toEqual(response);
  });

  it('fetches a marketplace listing detail by id', async () => {
    const response = {
      data: { id: 'listing-1', title: 'Agent 工作流模板' },
    };
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    });

    const result = await fetchMarketplaceListingById('listing-1');

    expect(getMock).toHaveBeenCalledWith('marketplace/listings/listing-1');
    expect(result).toEqual(response);
  });
});
