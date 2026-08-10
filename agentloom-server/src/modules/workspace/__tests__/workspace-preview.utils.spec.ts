import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  MAX_WORKSPACE_TEXT_PREVIEW_BYTES,
  buildWorkspaceFilePreview,
  buildWorkspaceFileTree,
  detectWorkspaceMimeType,
  findWorkspaceArchiveFileEntryFromStream,
  isBinaryWorkspaceFile,
  normalizeWorkspacePreviewPath,
  normalizeWorkspaceTreePath,
  parseWorkspaceArchiveEntries,
  parseWorkspaceArchiveEntriesFromStream,
} from '../workspace-preview.utils';

function writeString(
  buffer: Buffer,
  offset: number,
  length: number,
  value: string,
) {
  buffer.write(
    value,
    offset,
    Math.min(length, Buffer.byteLength(value)),
    'utf8',
  );
}

function tarEntry(
  path: string,
  type: 'file' | 'directory' | 'other',
  content: Buffer = Buffer.alloc(0),
  options: {
    prefix?: string;
    declaredSize?: number;
    zeroTypeFlag?: boolean;
  } = {},
): Buffer {
  const header = Buffer.alloc(512);
  writeString(header, 0, 100, path);
  writeString(header, 345, 155, options.prefix ?? '');
  const size = options.declaredSize ?? content.length;
  writeString(header, 124, 12, `${size.toString(8).padStart(11, '0')}\0`);
  if (!options.zeroTypeFlag) {
    header[156] =
      type === 'directory'
        ? '5'.charCodeAt(0)
        : type === 'file'
          ? '0'.charCodeAt(0)
          : '2'.charCodeAt(0);
  }
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
  return Buffer.concat([header, content, padding]);
}

function archive(...entries: Buffer[]): Buffer {
  return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

async function* chunks(values: unknown[]): AsyncGenerator<unknown> {
  for (const value of values) yield value;
}

describe('workspace preview utilities', () => {
  describe('path normalization and safety', () => {
    it('normalizes absolute, repeated, dot, and parent segments within the workspace', () => {
      expect(
        normalizeWorkspacePreviewPath('///docs//./draft/../readme.md'),
      ).toBe('docs/readme.md');
      expect(normalizeWorkspaceTreePath('././docs\\nested///file.txt/')).toBe(
        'docs/nested/file.txt',
      );
    });

    it.each(['../secret', 'docs/../../secret'])(
      'rejects traversal outside the workspace: %s',
      (path) => {
        expect(() => normalizeWorkspacePreviewPath(path)).toThrow(
          NotFoundException,
        );
      },
    );

    it.each(['', '/', '.', './'])(
      'rejects an empty preview path: %s',
      (path) => {
        expect(() => normalizeWorkspacePreviewPath(path)).toThrow(
          '文件路径不能为空',
        );
      },
    );

    it('filters only infrastructure paths while retaining ordinary hidden files', () => {
      expect(normalizeWorkspaceTreePath('')).toBeNull();
      expect(normalizeWorkspaceTreePath('.')).toBeNull();
      expect(normalizeWorkspaceTreePath('/')).toBeNull();
      expect(
        normalizeWorkspaceTreePath('src/node_modules/pkg/index.js'),
      ).toBeNull();
      expect(normalizeWorkspaceTreePath('.git/config')).toBeNull();
      expect(normalizeWorkspaceTreePath('.env')).toBe('.env');
    });
  });

  describe('MIME and preview contracts', () => {
    it('detects PDF, image, configured text, inferred text, and opaque binary files', () => {
      expect(detectWorkspaceMimeType('SPEC.PDF')).toBe('application/pdf');
      expect(detectWorkspaceMimeType('photo.JPEG')).toBe('image/jpeg');
      expect(detectWorkspaceMimeType('settings.YAML')).toBe('text/yaml');
      expect(
        detectWorkspaceMimeType('LICENSE', Buffer.from('plain text')),
      ).toBe('text/plain');
      expect(detectWorkspaceMimeType('artifact', Buffer.from([1, 0, 2]))).toBe(
        'application/octet-stream',
      );
      expect(detectWorkspaceMimeType('artifact')).toBe(
        'application/octet-stream',
      );
      expect(isBinaryWorkspaceFile(Buffer.from([1, 0, 2]))).toBe(true);
      expect(isBinaryWorkspaceFile(Buffer.from('text'))).toBe(false);
    });

    it('builds text, image, PDF, unsupported, and oversized-text previews', () => {
      const text = Buffer.from('hello');
      expect(
        buildWorkspaceFilePreview('/docs/readme.md', {
          path: 'docs/readme.md',
          type: 'file',
          size: text.length,
          content: text,
        }),
      ).toMatchObject({
        kind: 'text',
        path: 'docs/readme.md',
        fileName: 'readme.md',
        mimeType: 'text/markdown',
        content: 'hello',
        encoding: 'utf-8',
        canDownload: true,
      });
      expect(
        buildWorkspaceFilePreview('cover.webp', {
          path: 'cover.webp',
          type: 'file',
          size: 2,
          content: Buffer.from([0, 1]),
        }),
      ).toMatchObject({ kind: 'image', mimeType: 'image/webp' });
      expect(
        buildWorkspaceFilePreview('manual.pdf', {
          path: 'manual.pdf',
          type: 'file',
          size: 4,
          content: Buffer.from('%PDF'),
        }),
      ).toMatchObject({ kind: 'pdf', mimeType: 'application/pdf' });
      expect(
        buildWorkspaceFilePreview('program.bin', {
          path: 'program.bin',
          type: 'file',
          size: 3,
          content: Buffer.from([1, 0, 2]),
        }),
      ).toMatchObject({
        kind: 'unsupported',
        canDownload: true,
        reason: expect.stringContaining('本地查看'),
      });
      expect(
        buildWorkspaceFilePreview('huge.txt', {
          path: 'huge.txt',
          type: 'file',
          size: MAX_WORKSPACE_TEXT_PREVIEW_BYTES + 1,
          content: Buffer.from('small sample'),
        }),
      ).toMatchObject({
        kind: 'unsupported',
        reason: expect.stringContaining(`${MAX_WORKSPACE_TEXT_PREVIEW_BYTES}`),
      });
    });
  });

  describe('archive parsing and bounds', () => {
    it('parses rootless files, directories, prefix paths, zero type flags, and ignores unsafe/other entries', () => {
      const result = parseWorkspaceArchiveEntries(
        archive(
          tarEntry('docs', 'directory'),
          tarEntry('readme.md', 'file', Buffer.from('hello'), {
            prefix: 'docs',
          }),
          tarEntry('zero.txt', 'file', Buffer.alloc(0), { zeroTypeFlag: true }),
          tarEntry('.git/config', 'file', Buffer.from('hidden')),
          tarEntry('link', 'other'),
        ),
      );
      expect(
        result.map(({ path, type, size }) => ({ path, type, size })),
      ).toEqual([
        { path: 'docs', type: 'directory', size: 0 },
        { path: 'docs/readme.md', type: 'file', size: 5 },
        { path: 'zero.txt', type: 'file', size: 0 },
      ]);
    });

    it('strips a common workspace root including the root directory entry', () => {
      const result = parseWorkspaceArchiveEntries(
        archive(
          tarEntry('workspace', 'directory'),
          tarEntry('workspace/a.txt', 'file', Buffer.from('a')),
        ),
      );
      expect(result).toEqual([
        { path: 'a.txt', type: 'file', size: 1, content: Buffer.from('a') },
      ]);
      expect(parseWorkspaceArchiveEntries(Buffer.alloc(1024))).toEqual([]);
    });

    it('rejects a declared file body that exceeds the archive bounds', () => {
      const malformed = tarEntry('broken.bin', 'file', Buffer.alloc(0), {
        declaredSize: 1024,
      }).subarray(0, 512);
      expect(() => parseWorkspaceArchiveEntries(malformed)).toThrow(
        '工作区快照已损坏',
      );
    });

    it('streams metadata across empty, Uint8Array, string, and Buffer chunks', async () => {
      const tar = archive(
        tarEntry('workspace/docs', 'directory'),
        tarEntry('workspace/docs/a.txt', 'file', Buffer.from('abc')),
      );
      const split = [
        '',
        Buffer.alloc(0),
        new Uint8Array(tar.subarray(0, 200)),
        tar.subarray(200, 700),
        tar.subarray(700),
      ];
      await expect(
        parseWorkspaceArchiveEntriesFromStream(chunks(split)),
      ).resolves.toEqual([
        { path: 'docs', type: 'directory', size: 0, content: Buffer.alloc(0) },
        { path: 'docs/a.txt', type: 'file', size: 3, content: Buffer.alloc(0) },
      ]);
      await expect(
        parseWorkspaceArchiveEntriesFromStream(chunks([])),
      ).resolves.toEqual([]);
      await expect(
        parseWorkspaceArchiveEntriesFromStream(chunks([Buffer.alloc(512)])),
      ).resolves.toEqual([]);
    });

    it('rejects partial streamed headers and truncated streamed bodies', async () => {
      await expect(
        parseWorkspaceArchiveEntriesFromStream(chunks([Buffer.alloc(20)])),
      ).rejects.toThrow('工作区快照已损坏');
      const truncated = tarEntry('large.bin', 'file', Buffer.alloc(0), {
        declaredSize: 100,
      });
      await expect(
        parseWorkspaceArchiveEntriesFromStream(
          chunks([truncated.subarray(0, 530)]),
        ),
      ).rejects.toThrow('工作区快照已损坏');
    });

    it('finds both rooted and rootless aliases and preserves exact raw content', async () => {
      const rooted = archive(
        tarEntry('workspace/a.txt', 'file', Buffer.from('alpha')),
      );
      const rootless = archive(tarEntry('b.txt', 'file', Buffer.from('beta')));
      await expect(
        findWorkspaceArchiveFileEntryFromStream(chunks([rooted]), 'a.txt'),
      ).resolves.toMatchObject({
        normalizedPath: 'a.txt',
        entry: { path: 'workspace/a.txt', content: Buffer.from('alpha') },
      });
      await expect(
        findWorkspaceArchiveFileEntryFromStream(
          chunks([rootless]),
          'workspace/b.txt',
        ),
      ).resolves.toMatchObject({
        normalizedPath: 'workspace/b.txt',
        entry: { path: 'b.txt', content: Buffer.from('beta') },
      });
    });

    it('supports empty files and rejects directories, missing files, and traversal', async () => {
      const tar = archive(
        tarEntry('workspace/empty.txt', 'file'),
        tarEntry('workspace/docs', 'directory'),
      );
      await expect(
        findWorkspaceArchiveFileEntryFromStream(chunks([tar]), 'empty.txt'),
      ).resolves.toMatchObject({
        entry: { size: 0, content: Buffer.alloc(0) },
      });
      await expect(
        findWorkspaceArchiveFileEntryFromStream(chunks([tar]), 'docs'),
      ).rejects.toThrow('不是普通文件');
      await expect(
        findWorkspaceArchiveFileEntryFromStream(
          chunks([Buffer.alloc(512)]),
          'missing',
        ),
      ).rejects.toThrow('不是普通文件');
      await expect(
        findWorkspaceArchiveFileEntryFromStream(chunks([tar]), '../secret'),
      ).rejects.toThrow('路径穿越被拒绝');
    });
  });

  it('builds a deduplicated nested tree with root files and implicit directories', () => {
    const tree = buildWorkspaceFileTree([
      {
        path: 'src/lib/a.ts',
        type: 'file',
        size: 1,
        content: Buffer.from('a'),
      },
      {
        path: 'src/lib/a.ts',
        type: 'file',
        size: 99,
        content: Buffer.from('duplicate'),
      },
      { path: 'src/lib', type: 'directory', size: 0, content: Buffer.alloc(0) },
      { path: 'README.md', type: 'file', size: 2, content: Buffer.from('hi') },
      { path: 'empty', type: 'directory', size: 0, content: Buffer.alloc(0) },
    ]);
    expect(tree).toEqual([
      {
        name: 'src',
        type: 'directory',
        path: 'src',
        children: [
          {
            name: 'lib',
            type: 'directory',
            path: 'src/lib',
            children: [
              { name: 'a.ts', type: 'file', path: 'src/lib/a.ts', size: 1 },
            ],
          },
        ],
      },
      { name: 'README.md', type: 'file', path: 'README.md', size: 2 },
      { name: 'empty', type: 'directory', path: 'empty', children: [] },
    ]);
  });
});
