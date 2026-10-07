import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

import { useMfa, type MfaEnrollResult } from '../hooks/useMfa';

interface MfaEnrollDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type EnrollStep = 'loading' | 'scan' | 'verifying' | 'success';

const CODE_LENGTH = 6;

export function MfaEnrollDialog({
  open,
  onClose,
  onSuccess,
}: MfaEnrollDialogProps) {
  const { enrollTotp, verifyTotp, isLoading, error, clearError } = useMfa();
  const [step, setStep] = useState<EnrollStep>('loading');
  const [enrollData, setEnrollData] = useState<MfaEnrollResult | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const resetState = useCallback(() => {
    setStep('loading');
    setEnrollData(null);
    setDigits(Array(CODE_LENGTH).fill(''));
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (!open) return;

    resetState();

    enrollTotp()
      .then((data) => {
        setEnrollData(data);
        setStep('scan');
      })
      .catch(() => {
        setStep('scan');
      });
  }, [open, enrollTotp, resetState]);

  useEffect(() => {
    if (step === 'scan' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) onClose();
    },
    [onClose],
  );

  const handleDigitChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    if (value.length > 1) {
      const pasted = value.slice(0, CODE_LENGTH).split('');
      setDigits((prev) => {
        const newDigits = [...prev];
        for (let i = 0; i < pasted.length && index + i < CODE_LENGTH; i++) {
          const char = pasted[i] ?? '';
          if (/^\d$/.test(char)) {
            newDigits[index + i] = char;
          }
        }
        return newDigits;
      });
      const nextIndex = Math.min(index + pasted.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    setDigits((prev) => {
      const newDigits = [...prev];
      newDigits[index] = value;
      return newDigits;
    });

    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === 'Backspace' &&
        !(e.currentTarget as HTMLInputElement).value &&
        index > 0
      ) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [],
  );

  const digitsRef = useRef(digits);
  digitsRef.current = digits;

  const handleVerify = useCallback(async () => {
    if (!enrollData) return;

    const code = digitsRef.current.join('');
    if (code.length !== CODE_LENGTH) return;

    setStep('verifying');
    clearError();

    try {
      await verifyTotp(enrollData.factorId, code);
      setStep('success');
      onSuccess?.();
    } catch {
      setStep('scan');
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    }
  }, [enrollData, verifyTotp, clearError, onSuccess]);

  const code = digits.join('');
  const isCodeComplete = code.length === CODE_LENGTH;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" data-testid="mfa-enroll-dialog">
        <DialogHeader>
          <DialogTitle>启用两步验证</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {step === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                正在生成 TOTP 密钥...
              </p>
            </div>
          )}

          {(step === 'scan' || step === 'verifying') && (
            <div className="flex flex-col gap-5">
              {enrollData && (
                <>
                  <p className="text-sm text-muted-foreground">
                    使用身份验证器应用扫描下方二维码，然后输入 6
                    位验证码完成绑定。
                  </p>

                  <div className="flex justify-center">
                    {/* QR 码必须落在纯白底上才能保证扫描对比度，不随主题变化 */}
                    <div className="rounded-lg border border-border bg-white p-3">
                      <img
                        src={enrollData.qrCode}
                        alt="TOTP QR Code"
                        className="size-48"
                        data-testid="mfa-qr-code"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted p-3">
                    <p className="mb-1 text-xs text-muted-foreground">
                      无法扫描？手动输入密钥：
                    </p>
                    <code
                      className="block break-all font-mono text-xs text-foreground"
                      data-testid="mfa-secret-key"
                    >
                      {enrollData.secret}
                    </code>
                  </div>
                </>
              )}

              {error && (
                <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              <fieldset className="m-0 border-none p-0">
                <legend className="mb-2 text-sm font-medium text-foreground">
                  验证码
                </legend>
                <div
                  className="flex justify-center gap-2"
                  data-testid="mfa-code-input"
                >
                  {digits.map((digit, i) => (
                    <Input
                      key={`enroll-digit-${String(i)}`}
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={CODE_LENGTH}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      disabled={step === 'verifying'}
                      className="h-12 w-10 text-center font-mono text-lg"
                      aria-label={`验证码第 ${i + 1} 位`}
                    />
                  ))}
                </div>
              </fieldset>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={onClose}>
                  取消
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={!isCodeComplete || step === 'verifying' || isLoading}
                >
                  {step === 'verifying' ? '验证中...' : '确认绑定'}
                </Button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-success/15">
                <Check className="size-6 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">
                两步验证已成功启用
              </p>
              <p className="text-center text-xs text-muted-foreground">
                下次登录时，你需要输入身份验证器应用中的验证码。
              </p>
              <Button onClick={onClose} className="mt-2">
                完成
              </Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
