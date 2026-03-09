import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ThrottleService } from '../services/throttle.service';
import type { MergedOutputChunk } from '../services/throttle.service';

const EXEC_1 = 'exec-1';
const EXEC_2 = 'exec-2';
const STEP_A = 'step-a';
const STEP_B = 'step-b';

describe('ThrottleService', () => {
  let service: ThrottleService;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    const module = await Test.createTestingModule({
      providers: [ThrottleService],
    }).compile();

    service = module.get(ThrottleService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('tryConsume', () => {
    it('should consume token when bucket is full', () => {
      expect(service.tryConsume(EXEC_1)).toBe(true);
    });

    it('should exhaust after RATE_LIMIT consecutive calls', () => {
      for (let i = 0; i < ThrottleService.RATE_LIMIT; i++) {
        expect(service.tryConsume(EXEC_1)).toBe(true);
      }
      expect(service.tryConsume(EXEC_1)).toBe(false);
    });

    it('should refill tokens proportional to elapsed time', () => {
      for (let i = 0; i < ThrottleService.RATE_LIMIT; i++) {
        service.tryConsume(EXEC_1);
      }
      expect(service.tryConsume(EXEC_1)).toBe(false);

      vi.advanceTimersByTime(500);
      expect(service.tryConsume(EXEC_1)).toBe(true);
    });

    it('should track buckets independently per execution', () => {
      for (let i = 0; i < ThrottleService.RATE_LIMIT; i++) {
        service.tryConsume(EXEC_1);
      }
      expect(service.tryConsume(EXEC_1)).toBe(false);
      expect(service.tryConsume(EXEC_2)).toBe(true);
    });
  });

  describe('bufferOutputChunk', () => {
    it('should buffer chunks and invoke flush handler after merge window', () => {
      const handler = vi.fn();
      service.registerFlushHandler(handler);

      service.bufferOutputChunk(EXEC_1, STEP_A, 'Hello ', 0);
      service.bufferOutputChunk(EXEC_1, STEP_A, 'world', 1);

      expect(handler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(ThrottleService.MERGE_WINDOW_MS);

      expect(handler).toHaveBeenCalledOnce();
      const [execId, merged] = handler.mock.calls[0] as [
        string,
        MergedOutputChunk[],
      ];
      expect(execId).toBe(EXEC_1);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual({
        stepId: STEP_A,
        chunk: 'Hello world',
        startIndex: 0,
        endIndex: 1,
      });
    });

    it('should keep separate entries for different steps', () => {
      const handler = vi.fn();
      service.registerFlushHandler(handler);

      service.bufferOutputChunk(EXEC_1, STEP_A, 'A1', 0);
      service.bufferOutputChunk(EXEC_1, STEP_B, 'B1', 0);

      vi.advanceTimersByTime(ThrottleService.MERGE_WINDOW_MS);

      const merged = handler.mock.calls[0][1] as MergedOutputChunk[];
      expect(merged).toHaveLength(2);

      const stepAChunk = merged.find((m) => m.stepId === STEP_A);
      const stepBChunk = merged.find((m) => m.stepId === STEP_B);
      expect(stepAChunk?.chunk).toBe('A1');
      expect(stepBChunk?.chunk).toBe('B1');
    });

    it('should not invoke handler if no handler registered', () => {
      service.bufferOutputChunk(EXEC_1, STEP_A, 'data', 0);
      expect(() =>
        vi.advanceTimersByTime(ThrottleService.MERGE_WINDOW_MS),
      ).not.toThrow();
    });

    it('should not set a second timer within the same merge window', () => {
      const handler = vi.fn();
      service.registerFlushHandler(handler);

      service.bufferOutputChunk(EXEC_1, STEP_A, 'a', 0);
      vi.advanceTimersByTime(20);
      service.bufferOutputChunk(EXEC_1, STEP_A, 'b', 1);

      vi.advanceTimersByTime(ThrottleService.MERGE_WINDOW_MS - 20);
      expect(handler).toHaveBeenCalledOnce();

      const merged = handler.mock.calls[0][1] as MergedOutputChunk[];
      expect(merged[0].chunk).toBe('ab');
    });
  });

  describe('forceFlush', () => {
    it('should immediately return merged chunks', () => {
      service.bufferOutputChunk(EXEC_1, STEP_A, 'X', 0);
      service.bufferOutputChunk(EXEC_1, STEP_A, 'Y', 1);

      const merged = service.forceFlush(EXEC_1);
      expect(merged).toHaveLength(1);
      expect(merged[0]).toEqual({
        stepId: STEP_A,
        chunk: 'XY',
        startIndex: 0,
        endIndex: 1,
      });
    });

    it('should cancel pending timer so handler is not called', () => {
      const handler = vi.fn();
      service.registerFlushHandler(handler);

      service.bufferOutputChunk(EXEC_1, STEP_A, 'data', 0);
      service.forceFlush(EXEC_1);

      vi.advanceTimersByTime(ThrottleService.MERGE_WINDOW_MS * 2);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return empty array when nothing is pending', () => {
      expect(service.forceFlush(EXEC_1)).toEqual([]);
    });
  });

  describe('hasPending', () => {
    it('should return true when chunks are buffered', () => {
      service.bufferOutputChunk(EXEC_1, STEP_A, 'x', 0);
      expect(service.hasPending(EXEC_1)).toBe(true);
    });

    it('should return false when nothing buffered', () => {
      expect(service.hasPending(EXEC_1)).toBe(false);
    });

    it('should return false after forceFlush', () => {
      service.bufferOutputChunk(EXEC_1, STEP_A, 'x', 0);
      service.forceFlush(EXEC_1);
      expect(service.hasPending(EXEC_1)).toBe(false);
    });
  });

  describe('clearExecution', () => {
    it('should remove bucket, pending chunks, and timer', () => {
      service.tryConsume(EXEC_1);
      service.bufferOutputChunk(EXEC_1, STEP_A, 'data', 0);

      const handler = vi.fn();
      service.registerFlushHandler(handler);

      service.clearExecution(EXEC_1);

      vi.advanceTimersByTime(ThrottleService.MERGE_WINDOW_MS * 2);
      expect(handler).not.toHaveBeenCalled();
      expect(service.hasPending(EXEC_1)).toBe(false);
      expect(service.tryConsume(EXEC_1)).toBe(true);
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all state without leaking timers', () => {
      service.bufferOutputChunk(EXEC_1, STEP_A, 'a', 0);
      service.bufferOutputChunk(EXEC_2, STEP_B, 'b', 0);
      service.tryConsume(EXEC_1);

      const handler = vi.fn();
      service.registerFlushHandler(handler);

      service.onModuleDestroy();

      vi.advanceTimersByTime(ThrottleService.MERGE_WINDOW_MS * 2);
      expect(handler).not.toHaveBeenCalled();
      expect(service.hasPending(EXEC_1)).toBe(false);
      expect(service.hasPending(EXEC_2)).toBe(false);
    });
  });
});
