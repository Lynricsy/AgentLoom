import { Button } from '@/shared/ui/button';

interface WelcomeStepProps {
  onGetStarted: () => void;
}

export function WelcomeStep({ onGetStarted }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <span className="text-3xl">🕸️</span>
      </div>

      <h1 className="text-2xl font-bold text-foreground">
        Welcome to AgentLoom
      </h1>

      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Build powerful AI workflows by connecting agents on a visual canvas.
        Let's set up your workspace in just a few steps.
      </p>

      <Button className="mt-8 w-full" size="lg" onClick={onGetStarted}>
        Get Started
      </Button>
    </div>
  );
}
