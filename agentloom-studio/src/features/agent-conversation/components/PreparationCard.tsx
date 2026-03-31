import { memo, useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { PreparationPhase } from '../types';

/** Ordered preparation phases for display. */
const ALL_PHASES: PreparationPhase[] = [
  'queued',
  'preparing',
  'sandbox_creating',
  'agent_initializing',
  'running',
];

const PHASE_LABELS: Record<PreparationPhase, string> = {
  queued: '排队中',
  preparing: '准备环境',
  sandbox_creating: '沙箱启动中',
  agent_initializing: 'Agent 初始化',
  running: '开始运行',
};

type StepStatus = 'completed' | 'current' | 'pending' | 'failed';

function getStepStatus(
  stepPhase: PreparationPhase,
  currentPhase: PreparationPhase,
  failedPhase: PreparationPhase | null,
  allPhases: PreparationPhase[],
): StepStatus {
  const stepIndex = allPhases.indexOf(stepPhase);
  const currentIndex = allPhases.indexOf(currentPhase);

  if (failedPhase && stepPhase === failedPhase) {
    return 'failed';
  }

  if (stepIndex < currentIndex) {
    return 'completed';
  }

  if (stepIndex === currentIndex) {
    return failedPhase ? 'completed' : 'current';
  }

  return 'pending';
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />;
    case 'current':
      return <Loader2 className="size-4 text-blue-500 animate-spin shrink-0" />;
    case 'failed':
      return <XCircle className="size-4 text-destructive shrink-0" />;
    case 'pending':
      return <Circle className="size-4 text-muted-foreground/40 shrink-0" />;
  }
}

function StepItem({
  label,
  status,
  error,
  isLast,
}: {
  label: string;
  status: StepStatus;
  error?: string | null;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-3">
      {/* Icon column with connecting line */}
      <div className="flex flex-col items-center">
        <StepIcon status={status} />
        {!isLast && (
          <div
            className={cn(
              'w-px flex-1 min-h-3',
              status === 'completed'
                ? 'bg-emerald-500/40'
                : status === 'failed'
                  ? 'bg-destructive/40'
                  : 'bg-border',
            )}
          />
        )}
      </div>

      {/* Label column */}
      <div className={cn('pb-3', isLast && 'pb-0')}>
        <span
          className={cn(
            'text-sm leading-none',
            status === 'completed' && 'text-muted-foreground',
            status === 'current' && 'text-foreground font-medium',
            status === 'pending' && 'text-muted-foreground/40',
            status === 'failed' && 'text-destructive font-medium',
          )}
        >
          {label}
        </span>
        {status === 'failed' && error && (
          <p className="mt-1 text-xs text-destructive/80 leading-relaxed">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function formatElapsedTime(startTime: number | null): string {
  if (!startTime) return '';
  const elapsed = Math.max(0, Math.round((Date.now() - startTime) / 1000));
  return `${elapsed}s`;
}

export interface PreparationCardProps {
  phase: PreparationPhase | null;
  startTime: number | null;
  sandboxReused: boolean;
  error: string | null;
  failedPhase: PreparationPhase | null;
}

export const PreparationCard = memo(function PreparationCard({
  phase,
  startTime,
  sandboxReused,
  error,
  failedPhase,
}: PreparationCardProps) {
  // Track collapsed state: collapses when phase becomes null (agent starts streaming)
  const [collapsed, setCollapsed] = useState(false);
  const [elapsedText, setElapsedText] = useState('');
  const prevPhaseRef = useRef(phase);
  const elapsedSnapshotRef = useRef<string | null>(null);

  // Detect transition from active phase to null (collapse trigger)
  useEffect(() => {
    if (prevPhaseRef.current !== null && phase === null) {
      elapsedSnapshotRef.current = formatElapsedTime(startTime);
      setCollapsed(true);
    }
    prevPhaseRef.current = phase;
  }, [phase, startTime]);

  // Update elapsed time while preparing
  useEffect(() => {
    if (phase === null || !startTime) return;

    setElapsedText(formatElapsedTime(startTime));
    const timer = setInterval(() => {
      setElapsedText(formatElapsedTime(startTime));
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, startTime]);

  // Determine which phases to display (filter out sandbox_creating when reused)
  const displayPhases = sandboxReused
    ? ALL_PHASES.filter((p) => p !== 'sandbox_creating')
    : ALL_PHASES;

  // Collapsed summary view
  if (collapsed) {
    return (
      <div className="transition-all duration-300 ease-in-out overflow-hidden">
        <div className="flex items-center gap-2 rounded-lg bg-card border border-border/50 px-3 py-2 shadow-sm">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs text-muted-foreground">
            {failedPhase
              ? '启动失败'
              : `环境就绪 · 用时 ${elapsedSnapshotRef.current || elapsedText}`}
          </span>
        </div>
      </div>
    );
  }

  // Active stepper view (only when phase is not null)
  if (phase === null) {
    return null;
  }

  return (
    <div className="transition-all duration-300 ease-in-out overflow-hidden">
      <div className="rounded-lg bg-card border border-border shadow-sm p-4">
        {displayPhases.map((stepPhase, index) => {
          const stepStatus = getStepStatus(
            stepPhase,
            phase,
            failedPhase,
            displayPhases,
          );

          return (
            <StepItem
              key={stepPhase}
              label={PHASE_LABELS[stepPhase]}
              status={stepStatus}
              error={stepPhase === failedPhase ? error : null}
              isLast={index === displayPhases.length - 1}
            />
          );
        })}

        {elapsedText && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground/60">
              已用时 {elapsedText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
