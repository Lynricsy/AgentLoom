import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useMfa } from '../hooks/useMfa';

const mockEnroll = vi.fn();
const mockChallenge = vi.fn();
const mockVerify = vi.fn();
const mockUnenroll = vi.fn();
const mockGetAuthenticatorAssuranceLevel = vi.fn();

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: (...args: unknown[]) => mockEnroll(...args),
        challenge: (...args: unknown[]) => mockChallenge(...args),
        verify: (...args: unknown[]) => mockVerify(...args),
        unenroll: (...args: unknown[]) => mockUnenroll(...args),
        getAuthenticatorAssuranceLevel: (...args: unknown[]) =>
          mockGetAuthenticatorAssuranceLevel(...args),
      },
    },
  },
}));

describe('useMfa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enrollTotp', () => {
    it('注册 TOTP 后返回 factorId、qrCode、secret 和 totpUri', async () => {
      mockEnroll.mockResolvedValue({
        data: {
          id: 'factor-123',
          totp: {
            qr_code: 'data:image/svg+xml;base64,QRCODE',
            secret: 'ABCDEFGH',
            uri: 'otpauth://totp/test?secret=ABCDEFGH',
          },
        },
        error: null,
      });

      const { result } = renderHook(() => useMfa());

      let enrollResult: Awaited<ReturnType<typeof result.current.enrollTotp>>;
      await act(async () => {
        enrollResult = await result.current.enrollTotp();
      });

      expect(mockEnroll).toHaveBeenCalledWith({
        factorType: 'totp',
        friendlyName: 'TOTP',
      });
      expect(enrollResult!).toEqual({
        factorId: 'factor-123',
        totpUri: 'otpauth://totp/test?secret=ABCDEFGH',
        qrCode: 'data:image/svg+xml;base64,QRCODE',
        secret: 'ABCDEFGH',
      });
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('enroll 返回错误时设置 error 状态', async () => {
      mockEnroll.mockResolvedValue({
        data: null,
        error: new Error('Enroll failed'),
      });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await expect(result.current.enrollTotp()).rejects.toThrow(
          'Enroll failed',
        );
      });

      expect(result.current.error).toBe('Enroll failed');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('verifyTotp', () => {
    it('先 challenge 后 verify 完成两步验证', async () => {
      mockChallenge.mockResolvedValue({
        data: { id: 'challenge-456' },
        error: null,
      });
      mockVerify.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await result.current.verifyTotp('factor-123', '123456');
      });

      expect(mockChallenge).toHaveBeenCalledWith({ factorId: 'factor-123' });
      expect(mockVerify).toHaveBeenCalledWith({
        factorId: 'factor-123',
        challengeId: 'challenge-456',
        code: '123456',
      });
      expect(result.current.error).toBeNull();
    });

    it('challenge 失败时设置 error 且不调用 verify', async () => {
      mockChallenge.mockResolvedValue({
        data: null,
        error: new Error('Challenge failed'),
      });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await expect(
          result.current.verifyTotp('factor-123', '123456'),
        ).rejects.toThrow('Challenge failed');
      });

      expect(mockVerify).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Challenge failed');
    });

    it('verify 失败时设置 error 状态', async () => {
      mockChallenge.mockResolvedValue({
        data: { id: 'challenge-456' },
        error: null,
      });
      mockVerify.mockResolvedValue({
        error: new Error('Invalid code'),
      });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await expect(
          result.current.verifyTotp('factor-123', '123456'),
        ).rejects.toThrow('Invalid code');
      });

      expect(result.current.error).toBe('Invalid code');
    });
  });

  describe('unenrollTotp', () => {
    it('成功注销 TOTP 因子', async () => {
      mockUnenroll.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await result.current.unenrollTotp('factor-123');
      });

      expect(mockUnenroll).toHaveBeenCalledWith({ factorId: 'factor-123' });
      expect(result.current.error).toBeNull();
    });

    it('注销失败时设置 error 状态', async () => {
      mockUnenroll.mockResolvedValue({
        error: new Error('Unenroll failed'),
      });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await expect(
          result.current.unenrollTotp('factor-123'),
        ).rejects.toThrow('Unenroll failed');
      });

      expect(result.current.error).toBe('Unenroll failed');
    });
  });

  describe('checkAssuranceLevel', () => {
    it('返回正确的 AAL 数据', async () => {
      mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
        data: {
          currentLevel: 'aal1',
          nextLevel: 'aal2',
          currentAuthenticationMethods: [
            { method: 'password', timestamp: 1700000000 },
          ],
        },
        error: null,
      });

      const { result } = renderHook(() => useMfa());

      let aalResult: Awaited<
        ReturnType<typeof result.current.checkAssuranceLevel>
      >;
      await act(async () => {
        aalResult = await result.current.checkAssuranceLevel();
      });

      expect(aalResult!).toEqual({
        currentLevel: 'aal1',
        nextLevel: 'aal2',
        currentAuthenticationMethods: [
          { method: 'password', timestamp: 1700000000 },
        ],
      });
    });

    it('获取认证等级失败时设置 error', async () => {
      mockGetAuthenticatorAssuranceLevel.mockResolvedValue({
        data: null,
        error: new Error('AAL check failed'),
      });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await expect(
          result.current.checkAssuranceLevel(),
        ).rejects.toThrow('AAL check failed');
      });

      expect(result.current.error).toBe('AAL check failed');
    });
  });

  describe('clearError', () => {
    it('清除错误状态', async () => {
      mockEnroll.mockResolvedValue({
        data: null,
        error: new Error('Some error'),
      });

      const { result } = renderHook(() => useMfa());

      await act(async () => {
        await result.current.enrollTotp().catch(() => {});
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('isLoading 状态', () => {
    it('操作进行中 isLoading 为 true', async () => {
      let resolveEnroll: (value: unknown) => void;
      mockEnroll.mockReturnValue(
        new Promise((resolve) => {
          resolveEnroll = resolve;
        }),
      );

      const { result } = renderHook(() => useMfa());

      let enrollPromise: Promise<unknown>;
      act(() => {
        enrollPromise = result.current.enrollTotp();
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveEnroll!({
          data: {
            id: 'f-1',
            totp: { qr_code: 'qr', secret: 's', uri: 'u' },
          },
          error: null,
        });
        await enrollPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
