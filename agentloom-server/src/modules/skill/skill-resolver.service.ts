import { Injectable } from '@nestjs/common';
import { jsonSchema, tool, type ToolSet } from 'ai';

import type { SessionToolProvider } from '../agent/ports/agent-runtime.port';
import { SkillService } from './skill.service';
import type { SkillPromptPayload, SkillSummary } from './skill.types';

const SKILL_CONTENT_SIZE_THRESHOLD = 50 * 1024;

export const LOAD_SKILL_TOOL_NAME = 'load_skill';

const LOAD_SKILL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Name or slug of a skill listed in <available_skills>.',
    },
    file: {
      type: 'string',
      description:
        'Optional path of a bundled file of the skill. Omit to load SKILL.md.',
    },
  },
  required: ['name'],
  additionalProperties: false,
} satisfies Parameters<typeof jsonSchema>[0];

interface LoadSkillInput {
  name?: unknown;
  file?: unknown;
}

function readSkillMarkdown(skill: SkillPromptPayload): string {
  return skill.content ?? skill.files?.['SKILL.md'] ?? '';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Injectable()
export class SkillResolverService {
  constructor(private readonly skillService: SkillService) {}

  formatSkillSummariesForPrompt(skills: SkillSummary[]): string {
    if (skills.length === 0) {
      return '';
    }

    const lines = [
      '',
      '',
      'The following skills provide specialized instructions for specific tasks.',
      `Use the \`${LOAD_SKILL_TOOL_NAME}\` tool to load a skill when a task matches its description.`,
      '',
      '<available_skills>',
    ];

    for (const skill of skills) {
      lines.push('  <skill>');
      lines.push(`    <name>${escapeXml(skill.name)}</name>`);
      lines.push(
        `    <description>${escapeXml(skill.description)}</description>`,
      );
      lines.push('  </skill>');
    }

    lines.push('</available_skills>');

    return lines.join('\n');
  }

  formatSkillContentForPrompt(skill: SkillPromptPayload): string {
    return `<skill name="${escapeXml(skill.name)}">\n${readSkillMarkdown(skill)}\n</skill>`;
  }

  /**
   * 只在调用方已解析（即当前 Agent / 节点已绑定）的技能中查找，不回查技能库，
   * 因此模型无法借此读取未绑定或其他租户的技能。
   */
  createLoadSkillToolProvider(
    skills: SkillPromptPayload[],
  ): SessionToolProvider {
    const boundSkills = [...skills];
    return (): ToolSet => ({
      [LOAD_SKILL_TOOL_NAME]: tool({
        description:
          'Load the full instructions of a skill bound to this agent. Pass the skill name or slug from <available_skills>; pass `file` to read one of its bundled files.',
        inputSchema: jsonSchema(LOAD_SKILL_INPUT_SCHEMA),
        execute: (input) =>
          this.executeLoadSkill(boundSkills, input as LoadSkillInput),
      }),
    });
  }

  private executeLoadSkill(
    skills: SkillPromptPayload[],
    input: LoadSkillInput,
  ): string {
    const requested =
      typeof input.name === 'string' ? input.name.trim().toLowerCase() : '';
    const skill = skills.find(
      (candidate) =>
        candidate.name.trim().toLowerCase() === requested ||
        candidate.slug?.toLowerCase() === requested,
    );
    const available = skills
      .map((candidate) => candidate.slug ?? candidate.name)
      .join(', ');

    if (!skill) {
      return `Error: skill "${String(input.name ?? '')}" is not bound to this agent. Available skills: ${available || '(none)'}.`;
    }

    const bundledFiles = Object.keys(skill.files ?? {}).filter(
      (path) => path !== 'SKILL.md',
    );

    if (typeof input.file === 'string' && input.file.trim() !== '') {
      const filePath = input.file.trim();
      const fileContent =
        filePath === 'SKILL.md'
          ? readSkillMarkdown(skill)
          : skill.files?.[filePath];
      if (fileContent === undefined) {
        return `Error: skill "${skill.name}" has no file "${filePath}". Bundled files: ${bundledFiles.join(', ') || '(none)'}.`;
      }
      return fileContent;
    }

    const markdown = readSkillMarkdown(skill);
    if (bundledFiles.length === 0) {
      return markdown;
    }
    return `${markdown}\n\n<bundled_files>\n${bundledFiles.join('\n')}\n</bundled_files>\nCall ${LOAD_SKILL_TOOL_NAME} again with "file" to read a bundled file.`;
  }

  async resolveSkillsForAgent(
    tenantId: string,
    skillIds: string[],
  ): Promise<SkillPromptPayload[]> {
    if (skillIds.length === 0) {
      return [];
    }

    const skills = await this.skillService.findByIds(tenantId, skillIds);
    const activeSkills = skills.filter((skill) => skill.status === 'active');
    const skillMap = new Map(activeSkills.map((skill) => [skill.id, skill]));
    const skillFileEntries = await Promise.all(
      activeSkills.map(
        async (skill) =>
          [
            skill.id,
            await this.skillService.getSkillFileMap(
              tenantId,
              skill.id,
              skill.content,
              {
                isBuiltin: skill.isBuiltin,
                slug: skill.slug,
              },
            ),
          ] as const,
      ),
    );
    const skillFilesById = new Map(skillFileEntries);

    const payloads: SkillPromptPayload[] = [];

    for (const skillId of skillIds) {
      const skill = skillMap.get(skillId);
      if (!skill) {
        continue;
      }

      payloads.push({
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        description: skill.description,
        content: skill.content,
        files: skillFilesById.get(skill.id),
      });
    }

    return payloads;
  }

  buildSkillAugmentedPrompt(
    baseSystemPrompt: string,
    skills: SkillPromptPayload[],
  ): string {
    if (skills.length === 0) {
      return baseSystemPrompt;
    }

    const summaries = this.formatSkillSummariesForPrompt(
      skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      })),
    );
    const totalContentSize = skills.reduce(
      (sum, skill) => sum + readSkillMarkdown(skill).length,
      0,
    );

    if (totalContentSize > SKILL_CONTENT_SIZE_THRESHOLD) {
      return `${baseSystemPrompt}${summaries}`;
    }

    const fullContents = skills
      .map((skill) => this.formatSkillContentForPrompt(skill))
      .join('\n\n');

    return `${baseSystemPrompt}${summaries}\n\n${fullContents}`;
  }
}
