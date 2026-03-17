import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  marketplaceListings,
  marketplaceListingTypeEnum,
} from '../../../database/schema';

type IndexConfigEntry = {
  config: {
    name: string;
    unique?: boolean;
  };
};

type CheckConfigEntry = {
  name: string;
};

function getExtraConfigEntries(table: object): unknown[] {
  const symbols = Object.getOwnPropertySymbols(table);
  const extraConfigBuilderSymbol = symbols.find(
    (symbol) => String(symbol) === 'Symbol(drizzle:ExtraConfigBuilder)',
  );
  const extraConfigColumnsSymbol = symbols.find(
    (symbol) => String(symbol) === 'Symbol(drizzle:ExtraConfigColumns)',
  );

  if (!extraConfigBuilderSymbol || !extraConfigColumnsSymbol) {
    throw new Error('未找到 marketplaceListings 的 Drizzle extra config');
  }

  const extraConfigBuilder = Reflect.get(
    table,
    extraConfigBuilderSymbol,
  ) as ((columns: object) => unknown[]);
  const extraConfigColumns = Reflect.get(table, extraConfigColumnsSymbol) as object;

  return extraConfigBuilder(extraConfigColumns);
}

function isIndexConfigEntry(entry: unknown): entry is IndexConfigEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'config' in entry &&
    typeof (entry as IndexConfigEntry).config?.name === 'string'
  );
}

function isCheckConfigEntry(entry: unknown): entry is CheckConfigEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'name' in entry &&
    typeof (entry as CheckConfigEntry).name === 'string'
  );
}

describe('marketplaceListings 表定义', () => {
  const columns = getTableColumns(marketplaceListings);
  const extraConfigEntries = getExtraConfigEntries(marketplaceListings);
  const indexEntries = extraConfigEntries.filter(isIndexConfigEntry);
  const checkEntries = extraConfigEntries.filter(isCheckConfigEntry);

  it('表名应为 marketplace_listings', () => {
    expect(getTableName(marketplaceListings)).toBe('marketplace_listings');
  });

  it('应保留 workflow/plugin 双态关键字段', () => {
    expect(columns.workflowVersionId.notNull).toBe(false);
    expect(columns.pluginDbId.notNull).toBe(false);
    expect(columns.listingType.notNull).toBe(true);
    expect(columns.pricingModel.notNull).toBe(true);
  });

  it('listingType 枚举应支持 workflow 与 plugin', () => {
    expect(marketplaceListingTypeEnum.enumValues).toEqual([
      'workflow',
      'plugin',
    ]);
  });

  it('应包含 workflowVersionId 与 pluginDbId 的 partial unique 索引', () => {
    expect(indexEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          config: expect.objectContaining({
            name: 'uq_marketplace_listings_workflow_version_id',
            unique: true,
          }),
        }),
        expect.objectContaining({
          config: expect.objectContaining({
            name: 'uq_marketplace_listings_plugin_db_id',
            unique: true,
          }),
        }),
      ]),
    );
  });

  it('应包含 listingType 绑定约束与按次计费非负约束', () => {
    expect(checkEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'marketplace_listings_listing_type_binding_check',
        }),
        expect.objectContaining({
          name: 'marketplace_listings_price_per_execution_non_negative',
        }),
      ]),
    );
  });
});
