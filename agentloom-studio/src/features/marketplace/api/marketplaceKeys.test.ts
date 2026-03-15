import { describe, expect, it } from 'vitest';

import { marketplaceKeys } from './marketplaceKeys';

describe('marketplaceKeys', () => {
  it('creates stable list keys', () => {
    expect(marketplaceKeys.all).toEqual(['marketplace']);
    expect(marketplaceKeys.lists()).toEqual(['marketplace', 'list']);
    expect(marketplaceKeys.list()).toEqual(['marketplace', 'list', undefined]);
    expect(
      marketplaceKeys.list({ page: 2, pageSize: 10, status: 'listed' }),
    ).toEqual([
      'marketplace',
      'list',
      { page: 2, pageSize: 10, status: 'listed' },
    ]);
  });

  it('creates stable detail keys', () => {
    expect(marketplaceKeys.details()).toEqual(['marketplace', 'detail']);
    expect(marketplaceKeys.detail('listing-1')).toEqual([
      'marketplace',
      'detail',
      'listing-1',
    ]);
  });
});
