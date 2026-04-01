import { describe, expect, it } from 'vitest';
import {
  collectAllowedCorsOrigins,
  createCorsOriginDelegate,
  isAllowedCorsOrigin,
} from '../cors';

describe('cors helpers', () => {
  it('应接受无 origin 的服务端请求', () => {
    expect(isAllowedCorsOrigin(undefined, new Set())).toBe(true);
  });

  it('应接受 localhost 与 loopback 源', () => {
    const allowed = new Set<string>();

    expect(isAllowedCorsOrigin('http://127.0.0.1:3102', allowed)).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:5173', allowed)).toBe(true);
    expect(isAllowedCorsOrigin('http://0.0.0.0:8080', allowed)).toBe(true);
  });

  it('应接受显式配置的前端源', () => {
    const allowed = collectAllowedCorsOrigins('https://agentloom.ling.plus');

    expect(isAllowedCorsOrigin('https://agentloom.ling.plus', allowed)).toBe(
      true,
    );
  });

  it('应拒绝未知第三方源', () => {
    const allowed = collectAllowedCorsOrigins('https://agentloom.ling.plus');

    expect(isAllowedCorsOrigin('https://evil.example.com', allowed)).toBe(
      false,
    );
  });

  it('应忽略无效的 frontend url 配置', () => {
    const allowed = collectAllowedCorsOrigins('not-a-url');

    expect(allowed.size).toBe(0);
  });

  it('origin delegate 应把判定结果回调出去', () => {
    const allowed = collectAllowedCorsOrigins('https://agentloom.ling.plus');
    const decisions: boolean[] = [];
    const delegate = createCorsOriginDelegate(allowed);

    delegate('http://127.0.0.1:3102', (_error, allow) => {
      decisions.push(allow);
    });
    delegate('https://evil.example.com', (_error, allow) => {
      decisions.push(allow);
    });

    expect(decisions).toEqual([true, false]);
  });
});
