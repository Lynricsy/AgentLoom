export type {
  AgentDecision,
  ChainIntegrityStatus,
  EvidenceChainNode,
  EvidenceChainResponse,
  EvidencePacket,
  EvidencePacketSummary,
  EvidenceQueryParams,
  EvidenceRecord,
  EvidenceSourceType,
  EvidenceVerifyResult,
  IntegrityIssue,
  NodeErrorEvidencePacket,
  NodeErrorInfo,
  PhysicalLocation,
  SemanticLocation,
  ToolOutput,
} from './types';

export {
  fetchAllEvidenceByExecution,
  fetchEvidenceById,
  fetchEvidenceByExecution,
  fetchEvidenceChain,
  verifyEvidenceHash,
} from './api/evidenceApi';

export { fetchDocumentContent } from './api/documentApi';
export type { DocumentContentResult } from './api/documentApi';

export { evidenceKeys } from './api/evidenceKeys';

export {
  useAllEvidenceRecords,
  useDocumentContent,
  useEvidenceChain,
  useEvidenceDetail,
  useEvidenceList,
  useEvidenceVerify,
} from './api/evidenceQueries';

export {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
  useEvidenceUiExecutionId,
  useEvidenceUiHighlightState,
  useEvidenceUiIsOpen,
  useEvidenceUiNodeId,
  useEvidenceUiNodeName,
  useEvidenceUiSelectedId,
  useEvidenceUiStore,
} from './stores/evidenceUiStore';
export type { DocumentViewerState } from './stores/evidenceUiStore';

export { EvidenceCard } from './components/EvidenceCard';
export { EvidenceReferencePanel } from './components/EvidenceReferencePanel';
export { DocumentViewer } from './components/DocumentViewer';
export { InlineEvidenceRef } from './components/InlineEvidenceRef';
export { LocationLink } from './components/LocationLink';
export { SourceStatusBadge } from './components/SourceStatusBadge';

export {
  parseEvidenceRefs,
  hasEvidenceRefs,
} from './lib/parseEvidenceRefs';
export type { EvidenceRefSegment } from './lib/parseEvidenceRefs';
