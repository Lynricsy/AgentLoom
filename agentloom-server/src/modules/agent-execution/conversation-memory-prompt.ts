import type { MemoryBootSequenceResult } from '../agent-memory/services/boot-protocol.service';

export function buildMemoryBootPrompt(
  bootSequence: MemoryBootSequenceResult,
): string | undefined {
  const sections = [bootSequence.systemPrompt.trim()];

  if (typeof bootSequence.boot === 'string' && bootSequence.boot.trim()) {
    sections.push(`## Memory Boot\n${bootSequence.boot.trim()}`);
  }

  const navigationSummary = buildMemoryNavigationSummary(bootSequence);
  if (navigationSummary) {
    sections.push(navigationSummary);
  }

  return sections.filter(Boolean).join('\n\n') || undefined;
}

export function buildMemoryNavigationSummary(
  bootSequence: MemoryBootSequenceResult,
): string | undefined {
  const sections: string[] = [];

  if (bootSequence.index.length) {
    sections.push(
      [
        '## Memory Index',
        ...bootSequence.index.map(
          (path) => `- ${path.domain}://${path.pathString}`,
        ),
      ].join('\n'),
    );
  }

  if (bootSequence.glossary.length) {
    sections.push(
      [
        '## Memory Glossary',
        ...bootSequence.glossary.map(
          (entry) => `- ${entry.keyword} -> node:${entry.nodeId}`,
        ),
      ].join('\n'),
    );
  }

  return sections.join('\n\n') || undefined;
}

export function prependSystemPrompt(
  memoryPrompt?: string,
  baseSystemPrompt?: string,
): string | undefined {
  const sections = [memoryPrompt?.trim(), baseSystemPrompt?.trim()].filter(
    (value): value is string => Boolean(value),
  );

  return sections.length ? sections.join('\n\n') : undefined;
}
