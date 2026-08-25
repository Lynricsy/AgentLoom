import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMarketplaceListingById,
  fetchMyMarketplaceListings,
  relistMarketplaceListing,
  submitMarketplaceListing,
  submitPluginMarketplaceListing,
  unlistMarketplaceListing,
  updatePluginMarketplaceListing,
} from './marketplaceApi';

const { getMock, patchMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    patch: patchMock,
    post: postMock,
  },
}));

describe('marketplaceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a marketplace listing with camelCase body payload', async () => {
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

  it('submits a plugin listing to the plugin marketplace path', async () => {
    const request = {
      pluginDbId: 'plugin-db-1',
      title: '高质量机器翻译节点',
      summary: '把机器翻译能力接进画布，支持二十种语言互译并保留术语表。',
      tags: ['翻译'],
      pricingModel: 'per_execution' as const,
      pricePerExecution: '0.02',
    };
    const response = { data: { id: 'listing-1' }, reviewResult: {} };
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    });

    const result = await submitPluginMarketplaceListing(request);

    expect(postMock).toHaveBeenCalledWith('plugins/marketplace/listings', {
      json: request,
    });
    expect(result).toEqual(response);
  });

  it('patches a plugin listing and returns the fresh review result', async () => {
    const request = { title: '新的标题', tags: ['翻译', 'nlp'] };
    const response = {
      data: { id: 'listing-1', status: 'review_failed' },
      reviewResult: { outcome: 'failed', checks: [] },
    };
    patchMock.mockReturnValue({
      json: vi.fn().mockResolvedValue(response),
    });

    const result = await updatePluginMarketplaceListing('listing-1', request);

    expect(patchMock).toHaveBeenCalledWith(
      'plugins/marketplace/listings/listing-1',
      { json: request },
    );
    expect(result).toEqual(response);
  });
});
