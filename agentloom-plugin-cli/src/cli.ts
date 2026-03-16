import { Command } from 'commander';

import { buildCommand } from './commands/build';
import { createCommand } from './commands/create';
import { devCommand } from './commands/dev';
import { publishCommand } from './commands/publish';

const program = new Command()
  .name('agentloom-plugin')
  .description('AgentLoom Plugin Development CLI')
  .version('0.1.0');

program.addCommand(createCommand);
program.addCommand(devCommand);
program.addCommand(buildCommand);
program.addCommand(publishCommand);

program.parse();
