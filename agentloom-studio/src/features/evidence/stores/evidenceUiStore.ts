import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';

import type { PhysicalLocation } from '../types';

export interface DocumentViewerPhysicalLocation {
  page?: number;
  paragraph?: number;
  offset?: number;
  length?: number;
  chunkId?: string;
}

export interface DocumentViewerState {
  evidenceId: string;
  documentId: string;
  knowledgeBaseId?: string;
  fileName?: string;
  mimeType?: string;
  physicalLocation?: DocumentViewerPhysicalLocation;
}

export interface EvidenceUiState {
  isOpen: boolean;
  panelExecutionId: string | null;
  panelNodeId: string | null;
  panelNodeName: string | null;
  selectedEvidenceId: string | null;
  highlightedEvidenceId: string | null;
  highlightUntil: number | null;
  documentViewer: DocumentViewerState | null;
  graphSelectedNodeId: string | null;
}

export interface EvidenceUiActions {
  actions: {
    openPanel: (
      executionId: string,
      nodeId?: string,
      nodeName?: string,
      evidenceId?: string,
    ) => void;
    closePanel: () => void;
    selectEvidence: (evidenceId: string, opts?: { highlight?: boolean }) => void;
    openDocumentViewer: (state: DocumentViewerState) => void;
    closeDocumentViewer: () => void;
    openFromPhysicalLocation: (
      evidenceId: string,
      location: PhysicalLocation,
    ) => void;
    clearHighlight: () => void;
    reset: () => void;
    setGraphSelectedNodeId: (nodeId: string | null) => void;
  };
}

function createInitialState(): EvidenceUiState {
  return {
    isOpen: false,
    panelExecutionId: null,
    panelNodeId: null,
    panelNodeName: null,
    selectedEvidenceId: null,
    highlightedEvidenceId: null,
    highlightUntil: null,
    documentViewer: null,
    graphSelectedNodeId: null,
  };
}

export const useEvidenceUiStore = create<
  EvidenceUiState & EvidenceUiActions
>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...createInitialState(),
        actions: {
          openPanel: (
            executionId: string,
            nodeId?: string,
            nodeName?: string,
            evidenceId?: string,
          ) =>
            set(
              (state) => {
                state.isOpen = true;
                state.panelExecutionId = executionId;
                state.panelNodeId = nodeId ?? null;
                state.panelNodeName = nodeName ?? null;
                state.documentViewer = null;

                if (evidenceId) {
                  state.selectedEvidenceId = evidenceId;
                  state.highlightedEvidenceId = evidenceId;
                  state.highlightUntil = Date.now() + 2000;
                } else {
                  state.selectedEvidenceId = null;
                  state.highlightedEvidenceId = null;
                  state.highlightUntil = null;
                }
              },
              false,
              'evidence-ui/openPanel',
            ),

          closePanel: () =>
            set(
              (state) => {
                state.isOpen = false;
                state.panelExecutionId = null;
                state.panelNodeId = null;
                state.panelNodeName = null;
                state.selectedEvidenceId = null;
                state.highlightedEvidenceId = null;
                state.highlightUntil = null;
                state.documentViewer = null;
              },
              false,
              'evidence-ui/closePanel',
            ),

          selectEvidence: (
            evidenceId: string,
            opts?: { highlight?: boolean },
          ) =>
            set(
              (state) => {
                state.selectedEvidenceId = evidenceId;
                state.documentViewer = null;

                if (opts?.highlight) {
                  state.highlightedEvidenceId = evidenceId;
                  state.highlightUntil = Date.now() + 2000;
                } else {
                  state.highlightedEvidenceId = null;
                  state.highlightUntil = null;
                }
              },
              false,
              'evidence-ui/selectEvidence',
            ),

          openDocumentViewer: (viewerState: DocumentViewerState) =>
            set(
              (state) => {
                state.documentViewer = viewerState;
              },
              false,
              'evidence-ui/openDocumentViewer',
            ),

          closeDocumentViewer: () =>
            set(
              (state) => {
                state.documentViewer = null;
              },
              false,
              'evidence-ui/closeDocumentViewer',
            ),

          openFromPhysicalLocation: (
            evidenceId: string,
            location: PhysicalLocation,
          ) =>
            set(
              (state) => {
                state.selectedEvidenceId = evidenceId;
                state.documentViewer = {
                  evidenceId,
                  documentId: location.documentId,
                  knowledgeBaseId: location.knowledgeBaseId,
                  fileName: location.fileName,
                  physicalLocation: {
                    page: location.page,
                    paragraph: location.paragraph,
                    offset: location.offset,
                    length: location.length,
                    chunkId: location.chunkId,
                  },
                };
              },
              false,
              'evidence-ui/openFromPhysicalLocation',
            ),

          clearHighlight: () =>
            set(
              (state) => {
                state.highlightedEvidenceId = null;
                state.highlightUntil = null;
              },
              false,
              'evidence-ui/clearHighlight',
            ),

          reset: () => set(createInitialState(), false, 'evidence-ui/reset'),

          setGraphSelectedNodeId: (nodeId: string | null) =>
            set(
              (state) => {
                state.graphSelectedNodeId = nodeId;
              },
              false,
              'evidence-ui/setGraphSelectedNodeId',
            ),
        },
      })),
    ),
    { name: 'EvidenceUiStore' },
  ),
);

export const useEvidenceUiIsOpen = () =>
  useEvidenceUiStore((s) => s.isOpen);
export const useEvidenceUiSelectedId = () =>
  useEvidenceUiStore((s) => s.selectedEvidenceId);
export const useEvidenceUiExecutionId = () =>
  useEvidenceUiStore((s) => s.panelExecutionId);
export const useEvidenceUiNodeId = () => useEvidenceUiStore((s) => s.panelNodeId);
export const useEvidenceUiNodeName = () =>
  useEvidenceUiStore((s) => s.panelNodeName);
export const useEvidenceUiHighlightState = () =>
  useEvidenceUiStore(
    useShallow((s) => ({
      highlightedEvidenceId: s.highlightedEvidenceId,
      highlightUntil: s.highlightUntil,
    })),
  );
export const useEvidenceUiDocumentViewer = () =>
  useEvidenceUiStore((s) => s.documentViewer);
export const useEvidenceUiActions = () =>
  useEvidenceUiStore((s) => s.actions);
export const useEvidenceUiGraphSelectedNodeId = () =>
  useEvidenceUiStore((s) => s.graphSelectedNodeId);
