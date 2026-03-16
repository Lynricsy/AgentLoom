import { Command } from 'commander';

export const publishCommand = new Command('publish')
  .description('发布插件到 AgentLoom Marketplace')
  .action(() => {
    console.info(
      'Publishing to AgentLoom Marketplace is coming soon. Use the web interface to upload your .alp file.',
    );
  });
