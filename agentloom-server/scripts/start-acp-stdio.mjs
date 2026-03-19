import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distEntry = path.join(projectRoot, 'dist', 'src', 'acp-stdio.js');

async function writeStderr(message) {
  await new Promise((resolve, reject) => {
    if (process.stderr.write(message)) {
      resolve();
      return;
    }

    process.stderr.once('drain', resolve);
    process.stderr.once('error', reject);
  });
}

async function runSilentBuild() {
  const build = spawn(PNPM_BIN, ['exec', 'nest', 'build', '--path', 'tsconfig.build.json'], {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  build.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  build.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const [exitCode] = await once(build, 'exit');
  if (exitCode === 0) {
    return;
  }

  const buildOutput = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  throw new Error(buildOutput || `ACP stdio build failed with exit code ${String(exitCode)}`);
}

async function runCompiledEntry() {
  const child = spawn(process.execPath, [distEntry], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  const forwardSigint = () => {
    if (child.exitCode === null) {
      child.kill('SIGINT');
    }
  };
  const forwardSigterm = () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
    }
  };

  process.once('SIGINT', forwardSigint);
  process.once('SIGTERM', forwardSigterm);

  try {
    const [exitCode] = await once(child, 'exit');
    process.exitCode = exitCode ?? 1;
  } finally {
    process.off('SIGINT', forwardSigint);
    process.off('SIGTERM', forwardSigterm);
  }
}

try {
  await runSilentBuild();
  await runCompiledEntry();
} catch (error) {
  const message = error instanceof Error ? `${error.message}\n` : 'ACP stdio startup failed\n';
  await writeStderr(message);
  process.exitCode = 1;
}
