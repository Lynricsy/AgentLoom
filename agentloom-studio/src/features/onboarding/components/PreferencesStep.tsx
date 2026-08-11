import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { FormItem } from '@/shared/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';

interface PreferencesStepProps {
  onComplete: (prefs: { language: string; notifications: boolean }) => void;
  onSkip: () => void;
}

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
] as const;

export function PreferencesStep({ onComplete, onSkip }: PreferencesStepProps) {
  const [language, setLanguage] = useState('en');
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="flex flex-col">
      <div className="space-y-5">
        <FormItem>
          <label
            htmlFor="language-select"
            className="text-xs font-medium text-foreground"
          >
            语言
          </label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="language-select">
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>

        <div className="flex items-start justify-between gap-4 rounded-card border border-border bg-surface-elevated px-3.5 py-3">
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-foreground">通知</span>
            <p className="text-xs text-muted">接收工作流执行的更新通知</p>
          </div>
          <Switch
            aria-label="通知"
            checked={notifications}
            onCheckedChange={setNotifications}
          />
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={onSkip}>
          跳过
        </Button>
        <Button
          className="flex-1"
          onClick={() => onComplete({ language, notifications })}
        >
          完成设置
        </Button>
      </div>
    </div>
  );
}
