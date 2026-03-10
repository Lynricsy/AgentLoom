const EVIDENCE_REF_PATTERN = /\[ref:([\w-]+)\]/g

export type EvidenceRefSegment =
  | { type: 'text'; content: string }
  | { type: 'ref'; evidenceId: string; index: number }

export function parseEvidenceRefs(text: string): EvidenceRefSegment[] {
  const segments: EvidenceRefSegment[] = []
  let lastIndex = 0
  let refIndex = 1

  const regex = new RegExp(EVIDENCE_REF_PATTERN.source, 'g')

  for (
    let match = regex.exec(text);
    match !== null;
    match = regex.exec(text)
  ) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'ref', evidenceId: match[1]!, index: refIndex++ })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return segments
}

export function hasEvidenceRefs(text: string): boolean {
  return new RegExp(EVIDENCE_REF_PATTERN.source).test(text)
}
