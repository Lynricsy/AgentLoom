import { beforeEach, describe, expect, it } from 'vitest';

import { RingBuffer } from '../../src/pty/ring-buffer.js';

describe('RingBuffer', () => {
  let buffer: RingBuffer;

  beforeEach(() => {
    buffer = new RingBuffer();
  });

  it('should store and return written lines', () => {
    buffer.write('alpha\nbeta\n');

    expect(buffer.getLines()).toEqual(['  1: alpha', '  2: beta']);
    expect(buffer.totalLines).toBe(2);
    expect(buffer.byteSize).toBe(11);
  });

  it('should accumulate lines across multiple writes', () => {
    buffer.write('alpha\n');
    buffer.write('beta\ngamma\n');

    expect(buffer.getLines()).toEqual([
      '  1: alpha',
      '  2: beta',
      '  3: gamma',
    ]);
  });

  it('should support offset and limit pagination', () => {
    buffer.write('one\ntwo\nthree\nfour\n');

    expect(buffer.getLines(1, 2)).toEqual(['  2: two', '  3: three']);
  });

  it('should indicate hasMore when more lines exist', () => {
    buffer.write('one\ntwo\nthree\n');

    expect(buffer.readLines(0, 2)).toEqual({
      lines: ['  1: one', '  2: two'],
      totalLines: 3,
      hasMore: true,
    });
    expect(buffer.readLines(2, 2)).toEqual({
      lines: ['  3: three'],
      totalLines: 3,
      hasMore: false,
    });
  });

  it('should clamp negative or oversized offsets when paginating', () => {
    buffer.write('one\ntwo\n');

    expect(buffer.getLines(-5, 1)).toEqual(['  1: one']);
    expect(buffer.readLines(99, 2)).toEqual({
      lines: [],
      totalLines: 2,
      hasMore: false,
    });
  });

  it('should evict oldest lines when maxLines exceeded', () => {
    buffer = new RingBuffer(1_000, 2);

    buffer.write('one\ntwo\nthree\n');

    expect(buffer.getLines()).toEqual(['  1: two', '  2: three']);
    expect(buffer.totalLines).toBe(2);
  });

  it('should evict oldest lines when maxBytes exceeded', () => {
    buffer = new RingBuffer(10, 10);

    buffer.write('1234\n5678\n90\n');

    expect(buffer.getLines()).toEqual(['  1: 5678', '  2: 90']);
    expect(buffer.byteSize).toBe(8);
  });

  it('should buffer partial lines without trailing newline', () => {
    buffer.write('partial');

    expect(buffer.getLines()).toEqual([]);
    expect(buffer.totalLines).toBe(0);
    expect(buffer.getAllContent()).toBe('partial');
  });

  it('should merge partial line with next write', () => {
    buffer.write('hello');
    buffer.write(' world\nnext line\n');

    expect(buffer.getLines()).toEqual(['  1: hello world', '  2: next line']);
    expect(buffer.getAllContent()).toBe('hello world\nnext line');
  });

  it('should search lines by regex pattern', () => {
    buffer.write('alpha\nbeta\nalphabet\n');

    expect(buffer.searchLines('alpha')).toEqual([
      { lineNumber: 1, text: 'alpha' },
      { lineNumber: 3, text: 'alphabet' },
    ]);
  });

  it('should support case-insensitive search', () => {
    buffer.write('ERROR\nwarn\nerror\n');

    expect(buffer.searchLines('error', true)).toEqual([
      { lineNumber: 1, text: 'ERROR' },
      { lineNumber: 3, text: 'error' },
    ]);
  });

  it('should paginate search results', () => {
    buffer.write('match one\nskip\nmatch two\nmatch three\n');

    expect(buffer.searchLines('match', false, 1, 1)).toEqual([
      { lineNumber: 3, text: 'match two' },
    ]);
  });

  it('should clear all content', () => {
    buffer.write('alpha\nbeta\n');
    buffer.clear();

    expect(buffer.getLines()).toEqual([]);
    expect(buffer.getAllContent()).toBe('');
    expect(buffer.totalLines).toBe(0);
    expect(buffer.byteSize).toBe(0);
  });

  it('should return all content as single string', () => {
    buffer.write('alpha\nbeta\ngam');

    expect(buffer.getAllContent()).toBe('alpha\nbeta\ngam');
  });

  it('should return empty array for invalid regex', () => {
    buffer.write('alpha\nbeta\n');

    expect(buffer.searchLines('(')).toEqual([]);
  });

  it('should return empty result on empty buffer', () => {
    expect(buffer.getLines()).toEqual([]);
    expect(buffer.readLines()).toEqual({
      lines: [],
      totalLines: 0,
      hasMore: false,
    });
  });

  it('should treat zero limit as empty page', () => {
    buffer.write('alpha\nbeta\n');

    expect(buffer.getLines(0, 0)).toEqual([]);
    expect(buffer.searchLines('a', false, 0, 0)).toEqual([]);
  });
});
