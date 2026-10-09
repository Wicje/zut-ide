export interface LineComment {
  id: string;
  author: string;
  avatar?: string;
  text: string;
  createdAt: string;
  resolved?: boolean;
}

export interface DiffLine {
  id?: string;
  oldLineNumber?: number | string;
  newLineNumber?: number | string;
  type: 'context' | 'delete' | 'add';
  content: string;
  highlightTokens?: { text: string; type: 'del' | 'add' }[];
  comments?: LineComment[];
}

export interface DiffFile {
  id: string;
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
  extraContextTop?: DiffLine[];
  extraContextBottom?: DiffLine[];
  status: 'modified' | 'added' | 'deleted';
  staged?: boolean;
  accepted?: boolean;
}

export interface SidebarItem {
  id: string;
  title: string;
  badge?: 'blue' | 'gray';
  hasIcon?: boolean;
  iconType?: 'card' | 'panel' | 'toast';
  isMore?: boolean;
  category?: string;
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

export interface AgentStepMatch {
  file: string;
  line: number;
  preview: string;
}

export interface AgentStep {
  id: string;
  type: 'search' | 'grep' | 'read' | 'edit' | 'test';
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs?: number;
  matches?: AgentStepMatch[];
  details?: string;
  checkpointId?: string;
  snapshotStats?: { additions: number; deletions: number };
}

export interface ProjectFile {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  isModified?: boolean;
}

export interface SessionData {
  id: string;
  title: string;
  prompt: string;
  steps: AgentStep[];
  response: string;
  processedItem?: string;
  videoPreview?: boolean;
  summary: string;
  diffStats: { additions: number; deletions: number; filesCount: number };
  files: DiffFile[];
  model: string;
}

export type RightPaneMode = 'diff' | 'editor' | 'preview' | 'tests';
export type DiffViewMode = 'unified' | 'split';
export type ThemeMode = 'light' | 'dark';
export type DeviceViewport = 'desktop' | 'tablet' | 'mobile';

export interface AgentPhase {
  id: string;
  name: string;
  status: 'completed' | 'running' | 'queued' | 'failed';
  details: string;
  duration?: string;
  tokens?: number;
}

export interface ToolApprovalRequest {
  id: string;
  tool: string;
  command: string;
  riskLevel: 'safe' | 'medium' | 'destructive';
  status: 'pending' | 'approved' | 'rejected';
}

export interface AttachedContext {
  id: string;
  name: string;
  type: 'file' | 'git' | 'doc';
  tokens: number;
}

export interface TestCase {
  id: string;
  name: string;
  file: string;
  status: 'passed' | 'failed' | 'running';
  durationMs: number;
  expected?: string;
  actual?: string;
  error?: string;
}

// ---- Preserved chisom_ide backend contracts (lib/hooks/store) ----
// The GPIDE UI above uses adapters/filemap FileMap; the backend below
// keeps the original zut-ide types byte-identical so lib/* still compiles.
export type FileMap = Record<string, string>;

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleEntry {
  id: number;
  level: ConsoleLevel;
  message: string;
  timestamp: number;
  file?: string;
  line?: number;
  column?: number;
}

export interface Project {
  id: string;
  name: string;
  files: FileMap;
  share_token: string | null;
  updated_at: string | null;
}

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

/** User-facing run stage. Never expose infra words (Cells, Small-hours,
 *  externalId, session id) — only these stage labels reach the UI. */
export type RunStage = 'waking' | 'installing' | 'starting' | 'running' | 'ready';

export interface RunProgress {
  stage: RunStage | null;
  cancellable: boolean;
  startedAt: number | null;
}

/** Pilot cost trail. One row per run; broker persists the same shape to BaaS. */
export interface UsageRecord {
  workspaceId: string;
  command: string;
  status: 'success' | 'failed' | 'cancelled' | 'quota';
  exitCode: number | null;
  durationMs: number;
  /** Estimated Small-hours (server bills exact; client estimates for display). */
  smallHours: number;
  at: number;
}

export interface StoredProjectRow {
  id: string;
  name: string;
  files: FileMap;
  share_token: string | null;
  updated_at: string | null;
}

export interface RunnerError {
  message: string;
  location?: { line?: number; column?: number; file?: string };
}

export interface EditorSelection {
  file: string;
  text: string;
  startLine: number;
  endLine: number;
}

export interface ProgramResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  truncated?: boolean;
}



