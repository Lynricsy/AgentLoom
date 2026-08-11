import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { NativeSelect } from '@/shared/ui/native-select';
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
      <h2 className="text-xl font-bold text-foreground">偏好设置</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        自定义使用体验，之后可在设置中修改。
      </p>

      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="language-select"
            className="text-xs font-medium text-foreground"
          >
            语言
          </label>
          <NativeSelect
            id="language-select"
            value={language}
            onValueChange={setLanguage}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </NativeSelect>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">
              通知
            </span>
            <p className="text-xs text-muted-foreground">
              接收工作流执行的更新通知
            </p>
          </div>
          <Switch checked={notifications} onCheckedChange={setNotifications} />
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button variant="ghost" onClick={onSkip}>
          跳过
        </Button>
        <Button className="flex-1" onClick={handleComplete}>
          完成设置
        </Button>
      </div>
    </div>
  );
}
