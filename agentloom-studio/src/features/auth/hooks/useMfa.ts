import { useCallback, useState } from 'react';

import { supabase } from '@/shared/lib/supabase';

export interface MfaEnrollResult {
  /** 已注册的 factor ID */
  factorId: string;
  /** TOTP 配置 URI（otpauth://...） */
  totpUri: string;
  /** Base64 编码的 SVG QR 码（data:image/svg+xml;...） */
  qrCode: string;
  /** TOTP 密钥（手动输入用） */
  secret: string;
}

export interface AssuranceLevel {
  currentLevel: 'aal1' | 'aal2';
  nextLevel: 'aal1' | 'aal2';
  currentAuthenticationMethods: Array<{
    method: string;
    timestamp: number;
  }>;
}

export interface UseMfaReturn {
  /** 注册 TOTP 因子，返回 QR 码和密钥 */
  enrollTotp: () => Promise<MfaEnrollResult>;
  /** 验证 TOTP 验证码（challenge + verify） */
  verifyTotp: (factorId: string, code: string) => Promise<void>;
  /** 注销 TOTP 因子 */
  unenrollTotp: (factorId: string) => Promise<void>;
  /** 检查当前认证保证等级 */
  checkAssuranceLevel: () => Promise<AssuranceLevel>;
  /** 操作进行中 */
  isLoading: boolean;
  /** 最近一次操作的错误 */
  error: string | null;
  /** 清除错误状态 */
  clearError: () => void;
}

export function useMfa(): UseMfaReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const enrollTotp = useCallback(async (): Promise<MfaEnrollResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'TOTP',
      });

      if (enrollError) {
        throw enrollError;
      }

      return {
        factorId: data.id,
        totpUri: data.totp.uri,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '注册 TOTP 失败';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyTotp = useCallback(
    async (factorId: string, code: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId });

        if (challengeError) {
          throw challengeError;
        }

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId,
          challengeId: challengeData.id,
          code,
        });

        if (verifyError) {
          throw verifyError;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '验证 TOTP 失败';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const unenrollTotp = useCallback(
    async (factorId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId,
        });

        if (unenrollError) {
          throw unenrollError;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '注销 TOTP 失败';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const checkAssuranceLevel =
    useCallback(async (): Promise<AssuranceLevel> => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: aalError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

        if (aalError) {
          throw aalError;
        }

        return {
          currentLevel: data.currentLevel as 'aal1' | 'aal2',
          nextLevel: data.nextLevel as 'aal1' | 'aal2',
          currentAuthenticationMethods: data.currentAuthenticationMethods.map(
            (m) => ({
              method: typeof m === 'string' ? m : m.method,
              timestamp: typeof m === 'string' ? 0 : m.timestamp,
            }),
          ),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '获取认证等级失败';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    }, []);

  return {
    enrollTotp,
    verifyTotp,
    unenrollTotp,
    checkAssuranceLevel,
    isLoading,
    error,
    clearError,
  };
}
