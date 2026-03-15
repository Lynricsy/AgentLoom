import { promises as fs } from 'node:fs';
import path from 'node:path';

const sdkReadmePath = path.resolve('sdk/python/README.md');
const markerStart = '<!-- AgentLoom Custom Usage Start -->';
const markerEnd = '<!-- AgentLoom Custom Usage End -->';

function upsertMarkedSection(content, nextSectionHeading, sectionContent) {
  const markerPattern = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}\\n?`, 'g');

  if (markerPattern.test(content)) {
    return content.replace(markerPattern, `${sectionContent}\n`);
  }

  if (content.includes(nextSectionHeading)) {
    return content.replace(nextSectionHeading, `${sectionContent}\n${nextSectionHeading}`);
  }

  return `${content.trimEnd()}\n\n${sectionContent}`;
}

async function main() {
  const readme = await fs.readFile(sdkReadmePath, 'utf8');
  const customSection = `${markerStart}
### AgentLoom Authentication Quick Start

The generated Python SDK supports both JWT Bearer tokens and Platform API Tokens.

#### JWT Bearer example

\`\`\`python
import agentloom_sdk
from agentloom_sdk.api.workflow_definitions_api import WorkflowDefinitionsApi

configuration = agentloom_sdk.Configuration(
    host='https://your-agentloom.example.com/api/v1',
)
configuration.access_token = 'your-jwt-token'

with agentloom_sdk.ApiClient(configuration) as api_client:
    api = WorkflowDefinitionsApi(api_client)
    api.workflow_definition_create_find_all()
\`\`\`

#### X-Api-Key example

\`\`\`python
import agentloom_sdk
from agentloom_sdk.api.platform_api_tokens_api import PlatformAPITokensApi

configuration = agentloom_sdk.Configuration(
    host='https://your-agentloom.example.com/api/v1',
)
configuration.api_key['X-Api-Key'] = 'al_xxx_your_platform_token'

with agentloom_sdk.ApiClient(configuration) as api_client:
    api = PlatformAPITokensApi(api_client)
    token_page = api.platform_api_token_list()
    print(token_page.data)
\`\`\`

The same \`Configuration\` object also exposes retry, proxy, SSL, and debug settings for production integrations.
${markerEnd}`;

  const nextReadme = upsertMarkedSection(readme, '## Getting Started', customSection);
  if (nextReadme !== readme) {
    await fs.writeFile(sdkReadmePath, nextReadme, 'utf8');
  }
}

main().catch((error) => {
  console.error('Failed to post-process generated Python SDK:', error);
  process.exit(1);
});
