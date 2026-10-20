import chalk from 'chalk';
import { Command } from 'commander';

import { buildCommand } from './commands/build';
import { createCommand } from './commands/create';
import { devCommand } from './commands/dev';
import { keysCommand } from './commands/keys';
import { publishCommand } from './commands/publish';

export interface CliIo {
  error: (message: string) => void;
}

/**
 * 解析并执行命令。命令抛出的错误统一只打印 message 并返回退出码 1，
 * 不把 Node 堆栈与 execSync 的 Buffer 字段暴露给插件开发者。
 * commander 自身的 --help、--version 与参数错误仍由 commander 输出并退出。
 */
export async function runCli(
  argv: readonly string[],
  io: CliIo = console,
): Promise<number> {
  const program = new Command()
    .name('agentloom-plugin')
    .description('AgentLoom Plugin Development CLI')
    .version('0.1.0')
    .addCommand(createCommand)
    .addCommand(devCommand)
    .addCommand(buildCommand)
    .addCommand(keysCommand)
    .addCommand(publishCommand);

  try {
    await program.parseAsync([...argv]);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.error(chalk.red(`✖ ${message}`));
    return 1;
  }
}
