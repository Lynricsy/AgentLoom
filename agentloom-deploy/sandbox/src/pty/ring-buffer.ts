import type { PTYReadResult, RingBufferLike } from './types.js';

const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_MAX_LINES = 50_000;
const DEFAULT_READ_LIMIT = 500;
const DEFAULT_SEARCH_LIMIT = 100;

export class RingBuffer implements RingBufferLike {
  private lines: string[] = [];

  private pendingLine = '';

  private _byteSize = 0;

  private readonly maxBytes: number;

  private readonly maxLines: number;

  constructor(maxBytes: number = DEFAULT_MAX_BYTES, maxLines: number = DEFAULT_MAX_LINES) {
    this.maxBytes = Math.max(0, maxBytes);
    this.maxLines = Math.max(0, maxLines);
  }

  write(data: string): void {
    const combined = `${this.pendingLine}${data}`;
    this.pendingLine = '';

    const segments = combined.split('\n');

    if (segments.length === 1) {
      this.pendingLine = segments[0] ?? '';
      return;
    }

    const completeLines = segments.slice(0, -1);
    const trailingSegment = segments[segments.length - 1] ?? '';

    for (const line of completeLines) {
      this.lines.push(line);
      this._byteSize += this.getStoredByteSize(line);
    }

    this.pendingLine = trailingSegment;
    this.enforceLimit();
  }

  addLine(line: string): void {
    this.write(line);
  }

  getLines(offset: number = 0, limit: number = DEFAULT_READ_LIMIT): string[] {
    return this.readLines(offset, limit).lines;
  }

  readLines(offset: number = 0, limit: number = DEFAULT_READ_LIMIT): PTYReadResult {
    const start = this.normalizeOffset(offset, this.lines.length);
    const safeLimit = Math.max(0, limit);
    const end = start + safeLimit;

    return {
      lines: this.lines.slice(start, end).map((line, index) => {
        const lineNumber = start + index + 1;
        return `  ${lineNumber}: ${line}`;
      }),
      totalLines: this.lines.length,
      hasMore: end < this.lines.length,
    };
  }

  searchLines(
    pattern: string,
    ignoreCase: boolean = false,
    offset: number = 0,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ): Array<{ lineNumber: number; text: string }> {
    let regex: RegExp;

    try {
      regex = new RegExp(pattern, ignoreCase ? 'i' : '');
    } catch {
      return [];
    }

    const matches: Array<{ lineNumber: number; text: string }> = [];

    for (const [index, line] of this.lines.entries()) {
      if (regex.test(line)) {
        matches.push({ lineNumber: index + 1, text: line });
      }
    }

    const start = this.normalizeOffset(offset, matches.length);
    const safeLimit = Math.max(0, limit);

    return matches.slice(start, start + safeLimit);
  }

  getAllContent(): string {
    if (this.lines.length === 0) {
      return this.pendingLine;
    }

    if (this.pendingLine === '') {
      return this.lines.join('\n');
    }

    return `${this.lines.join('\n')}\n${this.pendingLine}`;
  }

  clear(): void {
    this.lines = [];
    this.pendingLine = '';
    this._byteSize = 0;
  }

  get totalLines(): number {
    return this.lines.length;
  }

  get byteSize(): number {
    return this._byteSize;
  }

  private enforceLimit(): void {
    while (this.lines.length > this.maxLines || this._byteSize > this.maxBytes) {
      const removedLine = this.lines.shift();

      if (removedLine === undefined) {
        this._byteSize = 0;
        break;
      }

      this._byteSize = Math.max(
        0,
        this._byteSize - this.getStoredByteSize(removedLine),
      );
    }
  }

  private normalizeOffset(offset: number, max: number): number {
    if (!Number.isFinite(offset) || offset < 0) {
      return 0;
    }

    return Math.min(offset, max);
  }

  private getStoredByteSize(line: string): number {
    return line.length + 1;
  }
}
