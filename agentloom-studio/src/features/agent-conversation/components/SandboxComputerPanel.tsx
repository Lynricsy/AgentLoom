import { memo, useRef, useEffect, useState, useCallback } from 'react';
import {
  Monitor,
  Terminal,
  Cpu,
  HardDrive,
  ChevronDown,
  ChevronRight,
  FileCode,
  FilePlus,
  FileX,
  FilePenLine,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { TerminalEntry, FileChange, SandboxStatus } from '../types';

interface SandboxComputerPanelProps {
  agentName: string;
  terminalEntries: TerminalEntry[];
  fileChanges: FileChange[];
  sandboxStatus: SandboxStatus;
}

function StatusDot({ status }: { status: SandboxStatus }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        status === 'running' && 'bg-success animate-pulse',
        status === 'idle' && 'bg-muted-foreground',
        status === 'error' && 'bg-error',
      )}
    />
  );
}

const TerminalLine = memo(function TerminalLine({
  entry,
}: {
  entry: TerminalEntry;
}) {
  return (
    <div className="py-1.5 border-b border-border/30 last:border-0">
      {entry.command && (
        <div className="flex items-center gap-1.5 text-success font-mono text-xs">
          <span className="text-muted-foreground select-none">$</span>
          <span>{entry.command}</span>
        </div>
      )}
      {entry.output && (
        <pre className="mt-0.5 font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
          {entry.output}
        </pre>
      )}
    </div>
  );
});

function TerminalView({ entries }: { entries: TerminalEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(entries.length);

  useEffect(() => {
    if (entries.length > prevCountRef.current && bottomRef.current) {
      queueMicrotask(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
    }
    prevCountRef.current = entries.length;
  });

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <Terminal className="h-4 w-4 mr-2 opacity-50" />
        <span>等待终端输出...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-3 font-mono text-xs"
    >
      {entries.map((entry) => (
        <TerminalLine key={entry.id} entry={entry} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function changeTypeIcon(changeType: FileChange['changeType']) {
  switch (changeType) {
    case 'created':
      return <FilePlus className="h-3.5 w-3.5 text-success" />;
    case 'modified':
      return <FilePenLine className="h-3.5 w-3.5 text-warning" />;
    case 'deleted':
      return <FileX className="h-3.5 w-3.5 text-error" />;
  }
}

function changeTypeLabel(changeType: FileChange['changeType']) {
  switch (changeType) {
    case 'created':
      return '新建';
    case 'modified':
      return '修改';
    case 'deleted':
      return '删除';
  }
}

const FileChangeItem = memo(function FileChangeItem({
  change,
}: {
  change: FileChange;
}) {
  const [expanded, setExpanded] = useState(false);
  const fileName = change.path.split('/').pop() ?? change.path;
  const dirPath = change.path.split('/').slice(0, -1).join('/');
  const hasDiff = !!change.diff;
  const hasContent = !!change.content;

  const toggleExpand = useCallback(() => {
    if (hasDiff || hasContent) {
      setExpanded((prev) => !prev);
    }
  }, [hasDiff, hasContent]);

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        type="button"
        onClick={toggleExpand}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-elevated/50 transition-colors',
          (hasDiff || hasContent) && 'cursor-pointer',
        )}
      >
        {hasDiff || hasContent ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {changeTypeIcon(change.changeType)}
        <span className="font-mono text-foreground truncate">{fileName}</span>
        {dirPath && (
          <span className="text-muted-foreground truncate ml-auto text-[10px]">
            {dirPath}
          </span>
        )}
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded shrink-0',
            change.changeType === 'created' && 'bg-success/15 text-success',
            change.changeType === 'modified' && 'bg-warning/15 text-warning',
            change.changeType === 'deleted' && 'bg-error/15 text-error',
          )}
        >
          {changeTypeLabel(change.changeType)}
        </span>
      </button>

      {expanded && (hasDiff || hasContent) && (
        <div className="px-3 pb-2">
          <pre className="bg-background rounded-md p-2 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
            {change.diff ? (
              <DiffHighlight diff={change.diff} />
            ) : (
              <span className="text-foreground/80">{change.content}</span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
});

function DiffHighlight({ diff }: { diff: string }) {
  const lines = diff.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        let lineClass = 'text-foreground/80';
        if (line.startsWith('+') && !line.startsWith('+++')) {
          lineClass = 'text-success bg-success/10';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          lineClass = 'text-error bg-error/10';
        } else if (line.startsWith('@@')) {
          lineClass = 'text-info';
        }
        return (
          <div key={`${i}-${line.slice(0, 20)}`} className={lineClass}>
            {line}
          </div>
        );
      })}
    </>
  );
}

function FileChangesView({ changes }: { changes: FileChange[] }) {
  if (changes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <FileCode className="h-4 w-4 mr-2 opacity-50" />
        <span>暂无文件变更</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {changes.map((change, index) => (
        <FileChangeItem key={`${change.path}-${index}`} change={change} />
      ))}
    </div>
  );
}

type PanelTab = 'terminal' | 'changes';

export function SandboxComputerPanel({
  agentName,
  terminalEntries,
  fileChanges,
  sandboxStatus,
}: SandboxComputerPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('terminal');

  return (
    <div className="flex flex-col h-full bg-surface rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-elevated/50">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-info" />
          <span className="text-sm font-medium text-foreground">
            {agentName}的电脑
          </span>
          <StatusDot status={sandboxStatus} />
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Cpu className="h-3 w-3" />
            <span>CPU</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-2">
            <HardDrive className="h-3 w-3" />
            <span>MEM</span>
          </div>
        </div>
      </div>

      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('terminal')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            activeTab === 'terminal'
              ? 'text-foreground border-b-2 border-info'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Terminal className="h-3 w-3" />
          终端
          {terminalEntries.length > 0 && (
            <span className="text-[10px] bg-surface-elevated px-1 rounded">
              {terminalEntries.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('changes')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            activeTab === 'changes'
              ? 'text-foreground border-b-2 border-info'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <FileCode className="h-3 w-3" />
          文件变更
          {fileChanges.length > 0 && (
            <span className="text-[10px] bg-surface-elevated px-1 rounded">
              {fileChanges.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'terminal' ? (
        <TerminalView entries={terminalEntries} />
      ) : (
        <FileChangesView changes={fileChanges} />
      )}
    </div>
  );
}
