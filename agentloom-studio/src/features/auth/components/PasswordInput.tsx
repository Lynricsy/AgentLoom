import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, error, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pr-10', error && 'border-error', className)}
          {...props}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted hover:bg-transparent hover:text-foreground"
          aria-label={visible ? '隐藏密码' : '显示密码'}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
