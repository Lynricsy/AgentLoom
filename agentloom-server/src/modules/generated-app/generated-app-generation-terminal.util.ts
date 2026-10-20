/**
 * 生成运行终态保证：runGates 在写入终态前抛错（含 Gate runner 异常、worker 关停中断）时，
 * 由 persistFailure 把运行标记为失败，运行不会停在 running 导致后续 start 一直 409。
 */
export async function runGenerationToTerminal<T>(
  runGates: (markTerminalPersisted: () => void) => Promise<T>,
  persistFailure: () => Promise<void>,
): Promise<T> {
  let terminalPersisted = false;
  try {
    return await runGates(() => {
      terminalPersisted = true;
    });
  } finally {
    if (!terminalPersisted) await persistFailure();
  }
}
