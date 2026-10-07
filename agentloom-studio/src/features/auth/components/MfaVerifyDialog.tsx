import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check, ShieldCheck } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

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
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const resetState = useCallback(() => {
    setStep('input');
    setDigits(Array(CODE_LENGTH).fill(''));
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (!open) return;

    resetState();
    setTimeout(() => inputRefs.current[0]?.focus(), 0);
  }, [open, resetState]);

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm" data-testid="mfa-verify-dialog">
        <DialogHeader>
          <DialogTitle>两步验证</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {step === 'input' || step === 'verifying' ? (
            <div className="flex flex-col gap-5">
              <div className="flex justify-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <ShieldCheck aria-hidden className="size-6 text-primary" />
                </div>
              </div>

              <p className="text-center text-sm text-muted-foreground">
                请输入身份验证器应用中的 6 位验证码以完成身份验证。
              </p>

              {error && (
                <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2">
                  <p className="text-sm text-error">{error}</p>
                </div>
              )}

              <fieldset className="m-0 border-none p-0">
                <legend className="mb-2 w-full text-center text-sm font-medium text-foreground">
                  验证码
                </legend>
                <div
                  className="flex justify-center gap-2"
                  data-testid="mfa-verify-code-input"
                >
                  {digits.map((digit, i) => (
                    <Input
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
                  {step === 'verifying' ? '验证中...' : '验证'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-success/15">
                <Check aria-hidden className="size-6 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">验证成功</p>
              <p className="text-center text-xs text-muted-foreground">
                身份已确认，你可以继续操作。
              </p>
              <Button onClick={onClose} className="mt-2">
                继续
              </Button>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
