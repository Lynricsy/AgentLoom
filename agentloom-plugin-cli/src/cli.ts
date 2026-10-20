import { runCli } from './program';

// 只设置 exitCode：dev 命令的 HTTP server 与 watcher 需要保持进程存活。
process.exitCode = await runCli(process.argv);
