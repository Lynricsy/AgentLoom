import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeBaseNodeConfig,
  getDocumentStatusLabel,
  getDocumentStatusVariant,
  isKnowledgeBaseConfigured,
} from '.';

describe('Knowledge Types', () => {
  describe('getDocumentStatusLabel', () => {
    it('returns correct labels for all statuses', () => {
      expect(getDocumentStatusLabel('uploaded')).toBe('已上传');
      expect(getDocumentStatusLabel('processing')).toBe('处理中');
      expect(getDocumentStatusLabel('ready')).toBe('就绪');
      expect(getDocumentStatusLabel('failed')).toBe('失败');
    });
  });

  describe('getDocumentStatusVariant', () => {
    it('returns correct badge variants', () => {
      expect(getDocumentStatusVariant('uploaded')).toBe('outline');
      expect(getDocumentStatusVariant('processing')).toBe('secondary');
      expect(getDocumentStatusVariant('ready')).toBe('default');
      expect(getDocumentStatusVariant('failed')).toBe('destructive');
    });
  });

  describe('buildKnowledgeBaseNodeConfig', () => {
    it('creates config with knowledgeBaseId', () => {
      const config = buildKnowledgeBaseNodeConfig('kb-123');
      expect(config).toEqual({ knowledgeBaseId: 'kb-123' });
    });
  });

  describe('isKnowledgeBaseConfigured', () => {
    it('returns true for valid config', () => {
      expect(isKnowledgeBaseConfigured({ knowledgeBaseId: 'kb-1' })).toBe(true);
    });

    it('returns false for empty knowledgeBaseId', () => {
      expect(isKnowledgeBaseConfigured({ knowledgeBaseId: '' })).toBe(false);
    });

    it('returns false for missing knowledgeBaseId', () => {
      expect(isKnowledgeBaseConfigured({})).toBe(false);
    });

    it('returns false for non-string knowledgeBaseId', () => {
      expect(isKnowledgeBaseConfigured({ knowledgeBaseId: 123 })).toBe(false);
    });
  });
});
