import { beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ToolCallStateMachineService } from '../services/tool-call-state-machine.service';
import { InvalidToolCallTransitionException } from '../execution.exceptions';
import type { ToolCallStatus } from '../../agent/types/tool-call-event.types';

describe('ToolCallStateMachineService', () => {
  let service: ToolCallStateMachineService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ToolCallStateMachineService],
    }).compile();

    service = module.get(ToolCallStateMachineService);
  });

  describe('transition()', () => {
    const validTransitions: [ToolCallStatus, ToolCallStatus][] = [
      ['pending', 'in_progress'],
      ['pending', 'awaiting_permission'],
      ['pending', 'failed'],
      ['awaiting_permission', 'in_progress'],
      ['awaiting_permission', 'denied'],
      ['in_progress', 'completed'],
      ['in_progress', 'failed'],
    ];

    it.each(validTransitions)('应允许 %s → %s 转换', (from, to) => {
      expect(service.transition(from, to)).toBe(to);
    });

    const invalidTransitions: [ToolCallStatus, ToolCallStatus][] = [
      ['pending', 'completed'],
      ['pending', 'denied'],
      ['awaiting_permission', 'completed'],
      ['awaiting_permission', 'failed'],
      ['awaiting_permission', 'pending'],
      ['in_progress', 'pending'],
      ['in_progress', 'awaiting_permission'],
      ['in_progress', 'denied'],
      ['denied', 'in_progress'],
      ['denied', 'pending'],
      ['completed', 'pending'],
      ['completed', 'failed'],
      ['failed', 'pending'],
      ['failed', 'in_progress'],
    ];

    it.each(invalidTransitions)('应拒绝 %s → %s 非法转换', (from, to) => {
      expect(() => service.transition(from, to)).toThrow(
        InvalidToolCallTransitionException,
      );
    });
  });

  describe('isTerminal()', () => {
    it('denied / completed / failed 为终态', () => {
      expect(service.isTerminal('denied')).toBe(true);
      expect(service.isTerminal('completed')).toBe(true);
      expect(service.isTerminal('failed')).toBe(true);
    });

    it('pending / awaiting_permission / in_progress 非终态', () => {
      expect(service.isTerminal('pending')).toBe(false);
      expect(service.isTerminal('awaiting_permission')).toBe(false);
      expect(service.isTerminal('in_progress')).toBe(false);
    });
  });

  describe('getAllowedTransitions()', () => {
    it('pending → [in_progress, awaiting_permission, failed]', () => {
      const allowed = service.getAllowedTransitions('pending');
      expect(allowed).toEqual(
        expect.arrayContaining([
          'in_progress',
          'awaiting_permission',
          'failed',
        ]),
      );
      expect(allowed).toHaveLength(3);
    });

    it('awaiting_permission → [in_progress, denied]', () => {
      const allowed = service.getAllowedTransitions('awaiting_permission');
      expect(allowed).toEqual(
        expect.arrayContaining(['in_progress', 'denied']),
      );
      expect(allowed).toHaveLength(2);
    });

    it('in_progress → [completed, failed]', () => {
      const allowed = service.getAllowedTransitions('in_progress');
      expect(allowed).toEqual(expect.arrayContaining(['completed', 'failed']));
      expect(allowed).toHaveLength(2);
    });

    it('终态返回空数组', () => {
      expect(service.getAllowedTransitions('denied')).toEqual([]);
      expect(service.getAllowedTransitions('completed')).toEqual([]);
      expect(service.getAllowedTransitions('failed')).toEqual([]);
    });
  });
});
