import { getNextMillis } from 'bullmq';
import { describe, expect, it } from 'vitest';

import {
  CreateTriggerSchema,
  CronConfigSchema,
  StoredCronConfigSchema,
  UpdateTriggerSchema,
} from '../dto/trigger.dto';

describe('Trigger DTO schemas', () => {
  describe('CronConfigSchema', () => {
    it.each([
      ['0 9 * * 1-5', 'Asia/Shanghai'],
      ['*/5 * * * *', 'UTC'],
      ['0 9 * * MON-FRI', 'America/New_York'],
      ['0 0 L * *', 'Europe/London'],
      ['30 8 1,15 * *', 'Etc/GMT-8'],
    ])('接受合法表达式 %s（时区 %s）', (expression, timezone) => {
      expect(CronConfigSchema.parse({ expression, timezone })).toEqual({
        expression,
        timezone,
      });
    });

    it('省略时区时默认 UTC', () => {
      expect(CronConfigSchema.parse({ expression: '0 9 * * *' })).toEqual({
        expression: '0 9 * * *',
        timezone: 'UTC',
      });
    });

    it.each([
      '99 * * * *',
      '0 25 * * *',
      '0 0 32 * *',
      '0 0 * 13 *',
      '0 0 * * 8',
      '*/0 * * * *',
      '0 0 30 2 *',
      'a b c d e',
    ])('拒绝调度器无法解析的表达式 %s，错误落在 expression', (expression) => {
      const result = CronConfigSchema.safeParse({
        expression,
        timezone: 'UTC',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([
        ['expression'],
      ]);
    });

    it.each(['Nope/Nope', 'Mars/Phobos', 'UTC+8'])(
      '拒绝非 IANA 时区 %s，错误落在 timezone',
      (timezone) => {
        const result = CronConfigSchema.safeParse({
          expression: '0 9 * * *',
          timezone,
        });

        expect(result.success).toBe(false);
        expect(result.error?.issues.map((issue) => issue.path)).toEqual([
          ['timezone'],
        ]);
      },
    );

    it.each([
      '0 9 * * 1-5',
      '*/5 * * * *',
      '*/60 * * * *',
      '5/15 * * * *',
      '0 0 30,31 2,4 *',
      '0 0 * * 7',
      '99 * * * *',
      '0 0 31 4 *',
      '10-5 * * * *',
      '1,,2 * * * *',
    ])('表达式 %s 的判定与 BullMQ 调度器 getNextMillis 一致', (expression) => {
      let schedulerAccepts: boolean;
      try {
        schedulerAccepts =
          getNextMillis(Date.now(), { pattern: expression, tz: 'UTC' }) !==
          undefined;
      } catch {
        schedulerAccepts = false;
      }

      expect(
        CronConfigSchema.safeParse({ expression, timezone: 'UTC' }).success,
      ).toBe(schedulerAccepts);
    });

    it('已落库配置只校验形状，旧值不阻断调度器启动同步', () => {
      expect(
        StoredCronConfigSchema.safeParse({
          expression: '0 9 * * *',
          timezone: 'UTC+8',
        }).success,
      ).toBe(true);
    });
  });

  describe('CreateTriggerSchema', () => {
    it('type 与 config 不一致时拒绝', () => {
      const result = CreateTriggerSchema.safeParse({
        name: 'x',
        type: 'cron',
        config: { eventSource: 'github', eventType: 'push' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path[0]).toBe('config');
    });

    it('cron 触发器值越界时拒绝', () => {
      expect(
        CreateTriggerSchema.safeParse({
          name: 'x',
          type: 'cron',
          config: { expression: '0 25 * * *', timezone: 'UTC' },
        }).success,
      ).toBe(false);
    });
  });

  describe('UpdateTriggerSchema', () => {
    it.each([
      [{ expression: '99 * * * *', timezone: 'UTC' }],
      [{ expression: '0 9 * * *', timezone: 'Nope/Nope' }],
    ])('cron config %j 不合法时拒绝', (config) => {
      expect(UpdateTriggerSchema.safeParse({ config }).success).toBe(false);
    });

    it('合法 cron config 通过', () => {
      expect(
        UpdateTriggerSchema.safeParse({
          config: { expression: '0 9 * * 1-5', timezone: 'Asia/Shanghai' },
        }).success,
      ).toBe(true);
    });
  });
});
