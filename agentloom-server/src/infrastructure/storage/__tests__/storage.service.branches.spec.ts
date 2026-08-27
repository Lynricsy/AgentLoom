import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  StorageKeyInvalidException,
  StorageObjectNotFoundException,
  StorageUnavailableException,
} from '../storage.exceptions';
import { StorageService } from '../storage.service';

const BUCKET = 'branch-bucket';

type MinioMock = Record<string, Mock>;

function createService() {
  const client: MinioMock = {
    bucketExists: vi.fn(),
    makeBucket: vi.fn(),
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn(),
    removeObject: vi.fn(),
    removeIncompleteUpload: vi.fn(),
    statObject: vi.fn(),
    presignedGetObject: vi.fn(),
  };
  const config = { get: vi.fn().mockReturnValue(BUCKET) };
  return {
    client,
    service: new StorageService(
      client as never,
      config as unknown as ConfigService,
    ),
  };
}

function readableWithHeaders(payload: string, headers: unknown): Readable {
  const stream = Readable.from(payload) as Readable & { headers?: unknown };
  stream.headers = headers;
  return stream;
}

describe('StorageService branch contracts', () => {
  let client: MinioMock;
  let service: StorageService;

  beforeEach(() => {
    ({ client, service } = createService());
  });

  it('does not fail module initialization when bucket discovery or creation fails', async () => {
    client.bucketExists.mockRejectedValueOnce(new Error('offline'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    client.bucketExists.mockResolvedValueOnce(false);
    client.makeBucket.mockRejectedValueOnce(new Error('read only'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('uploads a buffer using its exact size without optional metadata', async () => {
    const payload = Buffer.from('buffer payload');
    await service.upload('buffer.bin', payload);
    expect(client.putObject).toHaveBeenCalledWith(
      BUCKET,
      'buffer.bin',
      payload,
      payload.length,
      undefined,
    );
  });

  it.each([
    ['explicit zero', Readable.from(''), 0],
    ['explicit finite size', Readable.from('abc'), 3],
  ])(
    'uploads streams with %s without staging',
    async (_label, stream, size) => {
      await service.upload('stream.bin', stream as Readable, size as number);
      expect(client.putObject).toHaveBeenCalledWith(
        BUCKET,
        'stream.bin',
        stream,
        size,
        undefined,
      );
    },
  );

  it.each([
    ['numeric lowercase header', { 'content-length': 4 }, 4],
    ['uppercase string header', { 'Content-Length': '5' }, 5],
    ['array header', { 'content-length': ['6'] }, 6],
  ])(
    'uses a valid %s as the stream size',
    async (_label, headers, expectedSize) => {
      const stream = readableWithHeaders('data', headers);
      await service.upload('headers.bin', stream);
      expect(client.putObject).toHaveBeenCalledWith(
        BUCKET,
        'headers.bin',
        stream,
        expectedSize,
        undefined,
      );
    },
  );

  it.each([
    ['no headers property', Readable.from('abc')],
    ['null headers', readableWithHeaders('abc', null)],
    ['primitive headers', readableWithHeaders('abc', 'invalid')],
    [
      'negative numeric header',
      readableWithHeaders('abc', { 'content-length': -1 }),
    ],
    [
      'infinite numeric header',
      readableWithHeaders('abc', {
        'content-length': Number.POSITIVE_INFINITY,
      }),
    ],
    [
      'invalid string header',
      readableWithHeaders('abc', { 'content-length': 'unknown' }),
    ],
    [
      'negative string header',
      readableWithHeaders('abc', { 'content-length': '-3' }),
    ],
    [
      'empty array header',
      readableWithHeaders('abc', { 'content-length': [] }),
    ],
    [
      'non-string array header',
      readableWithHeaders('abc', { 'content-length': [3] }),
    ],
    [
      'unsupported header value',
      readableWithHeaders('abc', { 'content-length': true }),
    ],
  ])(
    'stages a stream with %s and uploads its measured bytes',
    async (_label, stream) => {
      const uploaded: Buffer[] = [];
      client.putObject.mockImplementationOnce(
        async (_bucket, _key, data: Readable, size: number) => {
          expect(size).toBe(3);
          for await (const chunk of data) uploaded.push(Buffer.from(chunk));
        },
      );
      await service.upload('staged.bin', stream as Readable, Number.NaN);
      expect(Buffer.concat(uploaded).toString()).toBe('abc');
    },
  );

  it('cleans a staged stream even when object upload fails', async () => {
    client.putObject.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      service.upload('failed.bin', Readable.from('payload')),
    ).rejects.toThrow('write failed');
  });

  // download 不再原样抛出：裸错误会一路冒泡成 500，客户端分不清「对象不存在」
  // 与「存储不可用」。delete / removeIncompleteUpload 仍保持原样透传。
  it('maps download failures and forwards delete/cleanup failures unchanged', async () => {
    const deleteError = new Error('delete failed');
    const cleanupError = new Error('cleanup failed');
    client.getObject.mockRejectedValueOnce({ code: 'NoSuchKey' });
    client.removeObject.mockRejectedValueOnce(deleteError);
    client.removeIncompleteUpload.mockRejectedValueOnce(cleanupError);
    await expect(service.download('a')).rejects.toBeInstanceOf(
      StorageObjectNotFoundException,
    );
    await expect(service.delete('b')).rejects.toBe(deleteError);
    await expect(service.removeIncompleteUpload('c')).rejects.toBe(
      cleanupError,
    );
  });

  it('maps a non-not-found download failure to storage unavailable', async () => {
    client.getObject.mockRejectedValueOnce(new Error('download failed'));
    await expect(service.download('a')).rejects.toBeInstanceOf(
      StorageUnavailableException,
    );
  });

  it('rejects blank storage keys before touching MinIO', async () => {
    await expect(service.getPresignedUrl('   ')).rejects.toBeInstanceOf(
      StorageKeyInvalidException,
    );
    expect(client.statObject).not.toHaveBeenCalled();
  });

  it.each([
    ['error name', { name: 'NoSuchObject' }],
    ['error message', { message: 'resource NotFound' }],
    ['missing bucket code', { code: 'NoSuchBucket' }],
  ])(
    'maps a missing object reported by %s during stat',
    async (_label, error) => {
      client.statObject.mockRejectedValueOnce(error);
      await expect(service.getPresignedUrl(' object ')).rejects.toBeInstanceOf(
        StorageObjectNotFoundException,
      );
      expect(client.statObject).toHaveBeenCalledWith(BUCKET, 'object');
    },
  );

  it.each([
    null,
    'offline',
    42,
    { code: 500, name: false, message: ['offline'] },
    { message: 'ECONNRESET' },
  ])(
    'maps a non-not-found stat error to storage unavailable: %j',
    async (error) => {
      client.statObject.mockRejectedValueOnce(error);
      await expect(service.getPresignedUrl('object')).rejects.toBeInstanceOf(
        StorageUnavailableException,
      );
    },
  );

  it('maps a late not-found error while signing and preserves other signing failures', async () => {
    client.statObject.mockResolvedValue({ size: 1 });
    client.presignedGetObject.mockRejectedValueOnce({ code: 'NoSuchKey' });
    await expect(service.getPresignedUrl('gone')).rejects.toBeInstanceOf(
      StorageObjectNotFoundException,
    );

    const signingError = new Error('signer unavailable');
    client.presignedGetObject.mockRejectedValueOnce(signingError);
    await expect(service.getPresignedUrl('present', 15)).rejects.toBeInstanceOf(
      StorageUnavailableException,
    );
    expect(client.presignedGetObject).toHaveBeenLastCalledWith(
      BUCKET,
      'present',
      15,
    );
  });
});
