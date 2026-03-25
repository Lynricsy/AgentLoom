import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';

interface PreferencesStepProps {
  onComplete: (prefs: { language: string; notifications: boolean }) => void;
  onSkip: () => void;
}

export function PreferencesStep({ onComplete, onSkip }: PreferencesStepProps) {
  const [language, setLanguage] = useState('en');
  const [notifications, setNotifications] = useState(true);

  function handleComplete() {
    onComplete({ language, notifications });
  }

  return (
    <div className="flex flex-col">
      <h2 className="text-xl font-bold text-foreground">Preferences</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Customize your experience. You can change these later in settings.
      </p>

      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="language-select"
            className="text-xs font-medium text-foreground"
          >
            Language
          </label>
          <Select
            id="language-select"
            value={language}
            onValueChange={setLanguage}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">
              Notifications
            </span>
            <p className="text-xs text-muted-foreground">
              Receive updates about workflow executions
            </p>
          </div>
          <Switch checked={notifications} onCheckedChange={setNotifications} />
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={onSkip}>
          Skip
        </Button>
        <Button className="flex-1" onClick={handleComplete}>
          Complete Setup
        </Button>
      </div>
    </div>
  );
}
