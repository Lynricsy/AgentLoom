import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  ConnectionStateOverlay,
  type ConnectionStateOverlayProps,
  type OverlayHandleSnapshot,
} from './ConnectionStateOverlay';

function createProps(
  overrides: Partial<ConnectionStateOverlayProps> = {},
): ConnectionStateOverlayProps {
  return {
    active: true,
    cursor: { x: 100, y: 200 },
    sourceHandle: { nodeId: 'src', portId: 'out', x: 50, y: 50 },
    compatibleTargets: [],
    incompatibleTargets: [],
    label: null,
    ...overrides,
  };
}

function createTarget(
  overrides: Partial<OverlayHandleSnapshot> = {},
): OverlayHandleSnapshot {
  return {
    nodeId: 'n1',
    portId: 'p1',
    x: 100,
    y: 100,
    ...overrides,
  };
}

describe('ConnectionStateOverlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when inactive', () => {
    const { container } = render(
      <ConnectionStateOverlay {...createProps({ active: false })} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders SVG overlay when active', () => {
    render(<ConnectionStateOverlay {...createProps()} />);
    expect(screen.getByTestId('connection-overlay')).toBeInTheDocument();
  });

  it('renders source handle halo', () => {
    render(<ConnectionStateOverlay {...createProps()} />);
    const svg = screen.getByTestId('connection-overlay');
    const sourceHalo = svg.querySelector(
      '.connection-overlay__halo--source',
    );
    expect(sourceHalo).toBeInTheDocument();
    expect(sourceHalo).toHaveAttribute('cx', '50');
    expect(sourceHalo).toHaveAttribute('cy', '50');
  });

  it('renders compatible target halos', () => {
    const targets = [
      createTarget({ nodeId: 'a', portId: 'p1', x: 10, y: 20 }),
      createTarget({ nodeId: 'b', portId: 'p2', x: 30, y: 40 }),
    ];
    render(
      <ConnectionStateOverlay
        {...createProps({ compatibleTargets: targets })}
      />,
    );
    const halos = screen
      .getByTestId('connection-overlay')
      .querySelectorAll('.connection-overlay__halo--compatible');
    expect(halos).toHaveLength(2);
    expect(halos[0]).toHaveAttribute('cx', '10');
    expect(halos[0]).toHaveAttribute('data-node-id', 'a');
    expect(halos[1]).toHaveAttribute('cx', '30');
    expect(halos[1]).toHaveAttribute('data-node-id', 'b');
  });

  it('renders incompatible target halos', () => {
    const targets = [
      createTarget({ nodeId: 'c', portId: 'p3', x: 60, y: 70 }),
    ];
    render(
      <ConnectionStateOverlay
        {...createProps({ incompatibleTargets: targets })}
      />,
    );
    const halos = screen
      .getByTestId('connection-overlay')
      .querySelectorAll('.connection-overlay__halo--incompatible');
    expect(halos).toHaveLength(1);
    expect(halos[0]).toHaveAttribute('data-port-id', 'p3');
  });

  it('renders label when provided', () => {
    render(
      <ConnectionStateOverlay
        {...createProps({ label: 'Exact match' })}
      />,
    );
    const labelEl = screen.getByTestId('connection-overlay-label');
    expect(labelEl).toHaveTextContent('Exact match');
  });

  it('does not render label when null', () => {
    render(
      <ConnectionStateOverlay {...createProps({ label: null })} />,
    );
    expect(
      screen.queryByTestId('connection-overlay-label'),
    ).not.toBeInTheDocument();
  });

  it('has aria-hidden on SVG root', () => {
    render(<ConnectionStateOverlay {...createProps()} />);
    expect(screen.getByTestId('connection-overlay')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('does not render source halo when sourceHandle is null', () => {
    render(
      <ConnectionStateOverlay
        {...createProps({ sourceHandle: null })}
      />,
    );
    const svg = screen.getByTestId('connection-overlay');
    expect(
      svg.querySelector('.connection-overlay__halo--source'),
    ).toBeNull();
  });

  it('positions label at cursor with offset', () => {
    render(
      <ConnectionStateOverlay
        {...createProps({ cursor: { x: 200, y: 300 }, label: 'Test' })}
      />,
    );
    const labelEl = screen.getByTestId('connection-overlay-label');
    expect(labelEl).toHaveAttribute('x', '214');
    expect(labelEl).toHaveAttribute('y', '290');
  });

  it('calls requestAnimationFrame for label position updates', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    render(
      <ConnectionStateOverlay
        {...createProps({ label: 'Moving' })}
      />,
    );
    expect(rafSpy).toHaveBeenCalled();
  });
});
