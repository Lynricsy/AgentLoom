import { describe, expect, it } from 'vitest';
import { knowledgeBaseKeys } from './knowledgeBaseKeys';

describe('knowledgeBaseKeys', () => {
  it('all returns base key', () => {
    expect(knowledgeBaseKeys.all).toEqual(['knowledge-bases']);
  });

  it('lists returns list key', () => {
    expect(knowledgeBaseKeys.lists()).toEqual(['knowledge-bases', 'list']);
  });

  it('list with filters appends filters', () => {
    const filters = { page: 1 };
    expect(knowledgeBaseKeys.list(filters)).toEqual([
      'knowledge-bases',
      'list',
      filters,
    ]);
  });

  it('details returns detail key', () => {
    expect(knowledgeBaseKeys.details()).toEqual(['knowledge-bases', 'detail']);
  });

  it('detail with id appends id', () => {
    expect(knowledgeBaseKeys.detail('kb-1')).toEqual([
      'knowledge-bases',
      'detail',
      'kb-1',
    ]);
  });

  it('documents nests under detail key', () => {
    expect(knowledgeBaseKeys.documents('kb-1')).toEqual([
      'knowledge-bases',
      'detail',
      'kb-1',
      'documents',
    ]);
  });

  it('documentList with filters', () => {
    const filters = { status: 'ready' };
    expect(knowledgeBaseKeys.documentList('kb-1', filters)).toEqual([
      'knowledge-bases',
      'detail',
      'kb-1',
      'documents',
      'list',
      filters,
    ]);
  });
});
