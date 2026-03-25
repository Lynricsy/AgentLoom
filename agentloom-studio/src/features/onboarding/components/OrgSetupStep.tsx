import { useState } from 'react';

import { Button } from '@/shared/ui/button';
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
    if (!trimmed) return 'Organization name is required';
    if (trimmed.length > MAX_ORG_NAME_LENGTH)
      return `Organization name must be ${MAX_ORG_NAME_LENGTH} characters or less`;
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
      <h2 className="text-xl font-bold text-foreground">
        Create your organization
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This is the workspace where your team will build and run AI workflows.
      </p>

      <div className="mt-6 space-y-2">
        <label
          htmlFor="org-name"
          className="text-xs font-medium text-foreground"
        >
          Organization name
        </label>
        <Input
          id="org-name"
          placeholder="e.g. Acme Corp"
          value={orgName}
          disabled={isSubmitting}
          maxLength={MAX_ORG_NAME_LENGTH}
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
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      <div className="mt-8 flex gap-3">
        <Button
          variant="ghost"
          disabled={isSubmitting}
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? 'Creating...' : 'Create Organization'}
        </Button>
      </div>
    </div>
  );
}
