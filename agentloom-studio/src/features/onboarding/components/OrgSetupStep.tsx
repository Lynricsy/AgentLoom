import { useState } from 'react';

import { Spinner } from '@/shared/components/spinner/Spinner';
import { Button } from '@/shared/ui/button';
import { FormItem } from '@/shared/ui/form';
import { Input } from '@/shared/ui/input';

interface OrgSetupStepProps {
  onSubmit: (orgName: string) => void;
  onBack: () => void;
  isSubmitting?: boolean;
}

const MAX_ORG_NAME_LENGTH = 100;

export function OrgSetupStep({
  onSubmit,
  onBack,
  isSubmitting = false,
}: OrgSetupStepProps) {
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');

  function validate(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '请输入组织名称';
    if (trimmed.length > MAX_ORG_NAME_LENGTH)
      return `组织名称不能超过 ${MAX_ORG_NAME_LENGTH} 个字符`;
    return '';
  }

  function handleSubmit() {
    const validationError = validate(orgName);
    if (validationError) {
      setError(validationError);
      return;
    }
    onSubmit(orgName.trim());
  }

  return (
    <div className="flex flex-col">
      <FormItem>
        <label htmlFor="org-name" className="text-xs font-medium text-foreground">
          组织名称
        </label>
        <Input
          id="org-name"
          placeholder="例如：Acme Corp"
          value={orgName}
          disabled={isSubmitting}
          maxLength={MAX_ORG_NAME_LENGTH}
          aria-invalid={!!error}
          className={error ? 'border-error' : undefined}
          onChange={(e) => {
            setOrgName(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              handleSubmit();
            }
          }}
        />
        {error ? (
          <p className="text-xs font-medium text-error">{error}</p>
        ) : (
          <p className="text-xs text-muted">
            之后可在「设置 - 组织」中修改名称。
          </p>
        )}
      </FormItem>

      <div className="mt-8 flex gap-3">
        <Button variant="ghost" disabled={isSubmitting} onClick={onBack}>
          返回
        </Button>
        <Button className="flex-1" disabled={isSubmitting} onClick={handleSubmit}>
          {isSubmitting ? (
            <>
              <Spinner className="text-primary-foreground" />
              创建中...
            </>
          ) : (
            '创建组织'
          )}
        </Button>
      </div>
    </div>
  );
}
