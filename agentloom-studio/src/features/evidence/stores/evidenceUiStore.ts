import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { PhysicalLocation } from '../types';

export interface DocumentViewerState {
  evidenceId: string;
  documentId: string;
  knowledgeBaseId?: string;
  fileName: string;
  mimeType?: string;
  page?: number;
  paragraph?: number;
  offset?: number;
  length?: number;
  chunkId?: string;
}

export interface EvidenceUiState {
  isOpen: boolean;
  selectedEvidenceId: string | null;
  executionId: string | null;
  documentViewer: DocumentViewerState | null;
}

export interface EvidenceUiActions {
  actions: {
    openPanel: (executionId: string, evidenceId?: string) => void;
    closePanel: () => void;
    selectEvidence: (evidenceId: string) => void;
    openDocumentViewer: (state: DocumentViewerState) => void;
    closeDocumentViewer: () => void;
    openFromPhysicalLocation: (
      evidenceId: string,
      location: PhysicalLocation,
    ) => void;
    reset: () => void;
  };
}

function createInitialState(): EvidenceUiState {
  return {
    isOpen: false,
    selectedEvidenceId: null,
    executionId: null,
    documentViewer: null,
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
          openPanel: (executionId: string, evidenceId?: string) =>
            set(
              (state) => {
                state.isOpen = true;
                state.executionId = executionId;
                if (evidenceId) state.selectedEvidenceId = evidenceId;
              },
              false,
              'evidence-ui/openPanel',
            ),

          closePanel: () =>
            set(
              (state) => {
                state.isOpen = false;
                state.selectedEvidenceId = null;
                state.documentViewer = null;
              },
              false,
              'evidence-ui/closePanel',
            ),

          selectEvidence: (evidenceId: string) =>
            set(
              (state) => {
                state.selectedEvidenceId = evidenceId;
                state.documentViewer = null;
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
                  fileName: location.fileName,
                  page: location.page,
                  paragraph: location.paragraph,
                  offset: location.offset,
                  length: location.length,
                  chunkId: location.chunkId,
                };
              },
              false,
              'evidence-ui/openFromPhysicalLocation',
            ),

          reset: () => set(createInitialState(), false, 'evidence-ui/reset'),
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
  useEvidenceUiStore((s) => s.executionId);
export const useEvidenceUiDocumentViewer = () =>
  useEvidenceUiStore((s) => s.documentViewer);
export const useEvidenceUiActions = () =>
  useEvidenceUiStore((s) => s.actions);
