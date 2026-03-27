import { Injectable } from '@nestjs/common';

import { SkillService } from './skill.service';
import type { SkillPromptPayload, SkillSummary } from './skill.types';

const SKILL_CONTENT_SIZE_THRESHOLD = 50 * 1024;

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
      'Use the skill tool to load a skill when a task matches its description.',
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
    return `<skill name="${escapeXml(skill.name)}">\n${skill.content ?? ''}\n</skill>`;
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

    return skillIds
      .map((skillId) => {
        const skill = skillMap.get(skillId);
        if (!skill) {
          return null;
        }

        return {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          content: skill.content,
        } satisfies SkillPromptPayload;
      })
      .filter((skill): skill is SkillPromptPayload => skill !== null);
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
      (sum, skill) => sum + (skill.content?.length ?? 0),
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
