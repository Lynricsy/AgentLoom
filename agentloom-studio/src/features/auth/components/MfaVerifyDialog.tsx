import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

import { useMfa } from '../hooks/useMfa';

interface MfaVerifyDialogProps {
  open: boolean;
  factorId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

type VerifyStep = 'input' | 'verifying' | 'success';

const CODE_LENGTH = 6;

export function MfaVerifyDialog({
  open,
  factorId,
  onClose,
  onSuccess,
}: MfaVerifyDialogProps) {
  const { verifyTotp, isLoading, error, clearError } = useMfa();
  const [step, setStep] = useState<VerifyStep>('input');
  const [digits, setDigits] = useState<string[]>(
    Array(CODE_LENGTH).fill(''),
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const resetState = useCallback(() => {
    setStep('input');
    setDigits(Array(CODE_LENGTH).fill(''));
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (!open) return;

    resetState();
    dialogRef.current?.showModal();
    setTimeout(() => inputRefs.current[0]?.focus(), 0);
  }, [open, resetState]);

  const handleClose = useCallback(() => {
    dialogRef.current?.close();
    onClose();
  }, [onClose]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
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
    },
    [],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !(e.currentTarget as HTMLInputElement).value && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [],
  );

  const digitsRef = useRef(digits);
  digitsRef.current = digits;

  const handleVerify = useCallback(async () => {
    const code = digitsRef.current.join('');
    if (code.length !== CODE_LENGTH) return;

    setStep('verifying');
    clearError();

    try {
      await verifyTotp(factorId, code);
      setStep('success');
      onSuccess?.();
    } catch {
      setStep('input');
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 0);
    }
  }, [factorId, verifyTotp, clearError, onSuccess]);

  const code = digits.join('');
  const isCodeComplete = code.length === CODE_LENGTH;

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto rounded-xl border border-border bg-surface p-0 shadow-xl backdrop:bg-black/50"
      onClose={handleClose}
    >
      <div className="w-[380px] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            两步验证
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-muted hover:text-foreground transition-colors"
            aria-label="关闭"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              role="img"
            >
              <title>关闭</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {step === 'input' || step === 'verifying' ? (
          <div className="flex flex-col gap-5">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                <svg
                  className="h-6 w-6 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  role="img"
                >
                  <title>安全验证</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </div>
            </div>

            <p className="text-sm text-muted text-center">
              请输入身份验证器应用中的 6 位验证码以完成身份验证。
            </p>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <fieldset className="border-none p-0 m-0">
              <legend className="mb-2 text-sm font-medium text-foreground text-center w-full">
                验证码
              </legend>
              <div className="flex gap-2 justify-center" data-testid="mfa-verify-code-input">
                {digits.map((digit, i) => (
                  <input
                    key={`verify-digit-${String(i)}`}
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
                    className={cn(
                      'h-12 w-10 rounded-md border border-input bg-background text-center text-lg font-mono text-foreground',
                      'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
                      'disabled:opacity-50',
                    )}
                    aria-label={`验证码第 ${i + 1} 位`}
                  />
                ))}
              </div>
            </fieldset>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button
                onClick={handleVerify}
                disabled={!isCodeComplete || step === 'verifying' || isLoading}
              >
                {step === 'verifying' ? '验证中...' : '验证'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
              <svg
                className="h-6 w-6 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                role="img"
              >
                <title>成功</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">
              验证成功
            </p>
            <p className="text-xs text-muted text-center">
              身份已确认，你可以继续操作。
            </p>
            <Button onClick={handleClose} className="mt-2">
              继续
            </Button>
          </div>
        )}
      </div>
    </dialog>
  );
}
