import { memo, useEffect, useRef } from 'react';

export interface OverlayHandleSnapshot {
  nodeId: string;
  portId: string;
  x: number;
  y: number;
  visualLevel?: 'L0' | 'L1' | 'error';
}

export interface ConnectionStateOverlayProps {
  active: boolean;
  cursor: { x: number; y: number } | null;
  sourceHandle: OverlayHandleSnapshot | null;
  compatibleTargets: OverlayHandleSnapshot[];
  incompatibleTargets: OverlayHandleSnapshot[];
  label: string | null;
}

const HALO_RADIUS = 18;
const LABEL_OFFSET_X = 14;
const LABEL_OFFSET_Y = -10;

export const ConnectionStateOverlay = memo(function ConnectionStateOverlay({
  active,
  cursor,
  sourceHandle,
  compatibleTargets,
  incompatibleTargets,
  label,
}: ConnectionStateOverlayProps) {
  const labelRef = useRef<SVGTextElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !cursor || !labelRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      if (!labelRef.current) return;
      labelRef.current.setAttribute(
        'x',
        String(cursor.x + LABEL_OFFSET_X),
      );
      labelRef.current.setAttribute(
        'y',
        String(cursor.y + LABEL_OFFSET_Y),
      );
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, cursor]);

  if (!active) return null;

  return (
    <svg
      className="connection-overlay"
      data-testid="connection-overlay"
      aria-hidden="true"
    >
      {sourceHandle && (
        <circle
          className="connection-overlay__halo connection-overlay__halo--source"
          cx={sourceHandle.x}
          cy={sourceHandle.y}
          r={HALO_RADIUS}
        />
      )}

      {compatibleTargets.map((t) => (
        <circle
          key={`compat-${t.nodeId}-${t.portId}`}
          className="connection-overlay__halo connection-overlay__halo--compatible"
          cx={t.x}
          cy={t.y}
          r={HALO_RADIUS}
          data-node-id={t.nodeId}
          data-port-id={t.portId}
        />
      ))}

      {incompatibleTargets.map((t) => (
        <circle
          key={`incompat-${t.nodeId}-${t.portId}`}
          className="connection-overlay__halo connection-overlay__halo--incompatible"
          cx={t.x}
          cy={t.y}
          r={HALO_RADIUS}
          data-node-id={t.nodeId}
          data-port-id={t.portId}
        />
      ))}

      {label && (
        <text
          ref={labelRef}
          className="connection-overlay__label"
          x={cursor ? cursor.x + LABEL_OFFSET_X : 0}
          y={cursor ? cursor.y + LABEL_OFFSET_Y : 0}
          data-testid="connection-overlay-label"
        >
          {label}
        </text>
      )}
    </svg>
  );
});
