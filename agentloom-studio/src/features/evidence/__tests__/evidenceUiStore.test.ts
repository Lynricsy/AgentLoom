import { describe, it, expect, beforeEach } from 'vitest';

import { useEvidenceUiStore } from '../stores/evidenceUiStore';

const { getState } = useEvidenceUiStore;

describe('evidenceUiStore', () => {
  beforeEach(() => {
    getState().actions.reset();
  });

  it('初始状态应为关闭且无选中', () => {
    const state = getState();
    expect(state.isOpen).toBe(false);
    expect(state.selectedEvidenceId).toBeNull();
    expect(state.executionId).toBeNull();
    expect(state.documentViewer).toBeNull();
  });

  describe('openPanel', () => {
    it('应设置 isOpen 为 true 并记录 executionId', () => {
      getState().actions.openPanel('exec-1');

      const state = getState();
      expect(state.isOpen).toBe(true);
      expect(state.executionId).toBe('exec-1');
      expect(state.selectedEvidenceId).toBeNull();
    });

    it('可同时指定初始选中的 evidenceId', () => {
      getState().actions.openPanel('exec-1', 'ev-1');

      const state = getState();
      expect(state.isOpen).toBe(true);
      expect(state.selectedEvidenceId).toBe('ev-1');
    });
  });

  describe('closePanel', () => {
    it('应重置面板状态但保留 executionId', () => {
      getState().actions.openPanel('exec-1', 'ev-1');
      getState().actions.closePanel();

      const state = getState();
      expect(state.isOpen).toBe(false);
      expect(state.selectedEvidenceId).toBeNull();
      expect(state.documentViewer).toBeNull();
      expect(state.executionId).toBe('exec-1');
    });
  });

  describe('selectEvidence', () => {
    it('应更新选中的证据并清除文档查看器', () => {
      getState().actions.openPanel('exec-1');
      getState().actions.openDocumentViewer({
        evidenceId: 'ev-1',
        documentId: 'doc-1',
        fileName: 'test.pdf',
      });
      getState().actions.selectEvidence('ev-2');

      const state = getState();
      expect(state.selectedEvidenceId).toBe('ev-2');
      expect(state.documentViewer).toBeNull();
    });
  });

  describe('openDocumentViewer', () => {
    it('应设置文档查看器状态', () => {
      const viewerState = {
        evidenceId: 'ev-1',
        documentId: 'doc-1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        page: 3,
        offset: 100,
        length: 50,
      };

      getState().actions.openDocumentViewer(viewerState);

      expect(getState().documentViewer).toEqual(viewerState);
    });
  });

  describe('closeDocumentViewer', () => {
    it('应仅清除文档查看器，保留选中证据', () => {
      getState().actions.openPanel('exec-1', 'ev-1');
      getState().actions.openDocumentViewer({
        evidenceId: 'ev-1',
        documentId: 'doc-1',
        fileName: 'test.pdf',
      });
      getState().actions.closeDocumentViewer();

      const state = getState();
      expect(state.documentViewer).toBeNull();
      expect(state.selectedEvidenceId).toBe('ev-1');
    });
  });

  describe('openFromPhysicalLocation', () => {
    it('应同时选中证据并打开文档查看器', () => {
      getState().actions.openFromPhysicalLocation('ev-1', {
        documentId: 'doc-1',
        fileName: 'report.pdf',
        page: 5,
        paragraph: 2,
        offset: 200,
        length: 80,
        chunkId: 'chunk-1',
      });

      const state = getState();
      expect(state.selectedEvidenceId).toBe('ev-1');
      expect(state.documentViewer).toEqual({
        evidenceId: 'ev-1',
        documentId: 'doc-1',
        fileName: 'report.pdf',
        page: 5,
        paragraph: 2,
        offset: 200,
        length: 80,
        chunkId: 'chunk-1',
      });
    });
  });

  describe('reset', () => {
    it('应恢复所有状态到初始值', () => {
      getState().actions.openPanel('exec-1', 'ev-1');
      getState().actions.openDocumentViewer({
        evidenceId: 'ev-1',
        documentId: 'doc-1',
        fileName: 'test.pdf',
      });
      getState().actions.reset();

      const state = getState();
      expect(state.isOpen).toBe(false);
      expect(state.selectedEvidenceId).toBeNull();
      expect(state.executionId).toBeNull();
      expect(state.documentViewer).toBeNull();
    });
  });
});
