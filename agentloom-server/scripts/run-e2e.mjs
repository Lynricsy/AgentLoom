import { spawn } from 'node:child_process';

const rawArgs = process.argv.slice(2);
const forwardedArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const child = spawn(
  'pnpm',
  ['exec', 'vitest', 'run', '--config', 'vitest.e2e.config.mts', ...forwardedArgs],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
