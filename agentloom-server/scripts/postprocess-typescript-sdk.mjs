import { promises as fs } from 'node:fs';
import path from 'node:path';

const sdkModelsDir = path.resolve('sdk/typescript/src/models');
const sdkReadmePath = path.resolve('sdk/typescript/README.md');
const readmeMarkerStart = '<!-- AgentLoom Custom Usage Start -->';
const readmeMarkerEnd = '<!-- AgentLoom Custom Usage End -->';

async function collectTypeScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith('.ts')) {
        return [entryPath];
      }

      return [];
    }),
  );

  return files.flat();
}

function buildTypedSerializerShim(typeName) {
  return [
    '',
    `export function ${typeName}ToJSONTyped(value?: ${typeName} | null, ignoreDiscriminator: boolean = false): any {`,
    '    void ignoreDiscriminator;',
    `    return ${typeName}ToJSON(value);`,
    '}',
    '',
  ].join('\n');
}

function normalizeTypedSerializerShim(typeName, content) {
  if (!content.includes(`export type ${typeName} = `)) {
    return null;
  }

  if (!content.includes(`export function ${typeName}ToJSON(`)) {
    return null;
  }

  if (content.includes(`export function ${typeName}ToJSONTyped(`)) {
    return null;
  }

  return `${content.trimEnd()}${buildTypedSerializerShim(typeName)}`;
}

function upsertMarkedSection(content, nextSectionHeading, sectionContent) {
  const markerPattern = new RegExp(
    `${readmeMarkerStart}[\\s\\S]*?${readmeMarkerEnd}\\n?`,
    'g',
  );

  if (markerPattern.test(content)) {
    return content.replace(markerPattern, `${sectionContent}\n`);
  }

  if (content.includes(nextSectionHeading)) {
    return content.replace(nextSectionHeading, `${sectionContent}\n${nextSectionHeading}`);
  }

  return `${content.trimEnd()}\n\n${sectionContent}`;
}

async function patchTypeScriptReadme() {
  const readme = await fs.readFile(sdkReadmePath, 'utf8');
  const customSection = `${readmeMarkerStart}
### Quick Start

The generated SDK supports both JWT Bearer tokens and Platform API Tokens via the same \`Configuration\` object.

#### JWT Bearer example

\`\`\`ts
import { Configuration, WorkflowDefinitionsApi } from '@agentloom/sdk';

const configuration = new Configuration({
  basePath: 'https://your-agentloom.example.com/api/v1',
  accessToken: process.env.AGENTLOOM_JWT!,
});

const workflowDefinitionsApi = new WorkflowDefinitionsApi(configuration);
await workflowDefinitionsApi.workflowDefinitionCreateFindAll();
\`\`\`

#### X-Api-Key example

\`\`\`ts
import { Configuration, PlatformAPITokensApi } from '@agentloom/sdk';

const configuration = new Configuration({
  basePath: 'https://your-agentloom.example.com/api/v1',
  apiKey: process.env.AGENTLOOM_API_KEY!,
});

const platformApiTokensApi = new PlatformAPITokensApi(configuration);
const page = await platformApiTokensApi.platformApiTokenList();
console.log(page.data?.length ?? 0);
\`\`\`

If you need custom headers, credentials, or a custom \`fetch\` implementation, pass them through the same \`Configuration\` instance.
${readmeMarkerEnd}`;

  const nextReadme = upsertMarkedSection(readme, '### Building', customSection);
  if (nextReadme !== readme) {
    await fs.writeFile(sdkReadmePath, nextReadme, 'utf8');
  }
}

async function main() {
  const files = await collectTypeScriptFiles(sdkModelsDir);
  let patchedFiles = 0;

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const typeMatch = content.match(/export type\s+(\w+)\s+=\s+/);
    if (!typeMatch) {
      continue;
    }

    const nextContent = normalizeTypedSerializerShim(typeMatch[1], content);
    if (!nextContent || nextContent === content) {
      continue;
    }

    await fs.writeFile(filePath, nextContent, 'utf8');
    patchedFiles += 1;
  }

  await patchTypeScriptReadme();

  console.log(`Post-processed TypeScript SDK union serializers: ${patchedFiles} file(s)`);
}

main().catch((error) => {
  console.error('Failed to post-process generated TypeScript SDK:', error);
  process.exit(1);
});
