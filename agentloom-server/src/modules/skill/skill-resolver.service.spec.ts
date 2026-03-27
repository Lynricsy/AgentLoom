import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillResolverService } from './skill-resolver.service';
import { SkillService } from './skill.service';
import type { SkillPromptPayload, SkillSummary } from './skill.types';

const mocks = vi.hoisted(() => ({
  createMockSkillService: () => ({
    findByIds: vi.fn().mockResolvedValue([]),
  }),
}));

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

describe('SkillResolverService', () => {
  let resolver: SkillResolverService;
  let skillService: ReturnType<typeof mocks.createMockSkillService>;

  beforeEach(async () => {
    skillService = mocks.createMockSkillService();

    const module = await Test.createTestingModule({
      providers: [
        SkillResolverService,
        { provide: SkillService, useValue: skillService },
      ],
    }).compile();

    resolver = module.get(SkillResolverService);
  });

  // ─── formatSkillSummariesForPrompt ─────────────────────────────────────
  describe('formatSkillSummariesForPrompt', () => {
    it('empty skills returns empty string', () => {
      expect(resolver.formatSkillSummariesForPrompt([])).toBe('');
    });

    it('generates correct XML structure', () => {
      const skills: SkillSummary[] = [
        { id: 'id-1', name: 'Code Review', description: 'Review code quality' },
      ];

      const result = resolver.formatSkillSummariesForPrompt(skills);

      expect(result).toContain('<available_skills>');
      expect(result).toContain('</available_skills>');
      expect(result).toContain('<skill>');
      expect(result).toContain('<name>Code Review</name>');
      expect(result).toContain(
        '<description>Review code quality</description>',
      );
    });

    it('escapes XML special characters', () => {
      const skills: SkillSummary[] = [
        { id: 'id-1', name: 'A & B <C>', description: '"quotes" & \'apos\'' },
      ];

      const result = resolver.formatSkillSummariesForPrompt(skills);

      expect(result).toContain('A &amp; B &lt;C&gt;');
      expect(result).toContain('&quot;quotes&quot; &amp; &apos;apos&apos;');
    });

    it('handles multiple skills', () => {
      const skills: SkillSummary[] = [
        { id: 'id-1', name: 'Skill A', description: 'Desc A' },
        { id: 'id-2', name: 'Skill B', description: 'Desc B' },
      ];

      const result = resolver.formatSkillSummariesForPrompt(skills);
      const skillBlocks = result.match(/<skill>/g);
      expect(skillBlocks).toHaveLength(2);
    });
  });

  // ─── formatSkillContentForPrompt ───────────────────────────────────────
  describe('formatSkillContentForPrompt', () => {
    it('wraps content in skill XML tag', () => {
      const skill: SkillPromptPayload = {
        id: 'id-1',
        name: 'My Skill',
        description: 'desc',
        content: '# Hello World',
      };

      const result = resolver.formatSkillContentForPrompt(skill);

      expect(result).toBe('<skill name="My Skill">\n# Hello World\n</skill>');
    });

    it('handles null content', () => {
      const skill: SkillPromptPayload = {
        id: 'id-1',
        name: 'Empty',
        description: 'desc',
        content: null,
      };

      const result = resolver.formatSkillContentForPrompt(skill);
      expect(result).toBe('<skill name="Empty">\n\n</skill>');
    });

    it('escapes XML in skill name', () => {
      const skill: SkillPromptPayload = {
        id: 'id-1',
        name: '<script>',
        description: 'desc',
        content: 'safe',
      };

      const result = resolver.formatSkillContentForPrompt(skill);
      expect(result).toContain('name="&lt;script&gt;"');
    });
  });

  // ─── resolveSkillsForAgent ─────────────────────────────────────────────
  describe('resolveSkillsForAgent', () => {
    it('returns empty for empty skillIds', async () => {
      const result = await resolver.resolveSkillsForAgent(TENANT_ID, []);
      expect(result).toEqual([]);
      expect(skillService.findByIds).not.toHaveBeenCalled();
    });

    it('loads skills and filters active only', async () => {
      skillService.findByIds.mockResolvedValue([
        {
          id: 'id-1',
          name: 'Active',
          description: 'desc A',
          content: '# A',
          status: 'active',
        },
        {
          id: 'id-2',
          name: 'Archived',
          description: 'desc B',
          content: '# B',
          status: 'archived',
        },
      ]);

      const result = await resolver.resolveSkillsForAgent(TENANT_ID, [
        'id-1',
        'id-2',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active');
    });

    it('maintains skillIds order', async () => {
      skillService.findByIds.mockResolvedValue([
        {
          id: 'id-2',
          name: 'B',
          description: 'B desc',
          content: '# B',
          status: 'active',
        },
        {
          id: 'id-1',
          name: 'A',
          description: 'A desc',
          content: '# A',
          status: 'active',
        },
      ]);

      const result = await resolver.resolveSkillsForAgent(TENANT_ID, [
        'id-1',
        'id-2',
      ]);

      expect(result[0].id).toBe('id-1');
      expect(result[1].id).toBe('id-2');
    });

    it('skips not-found skill IDs', async () => {
      skillService.findByIds.mockResolvedValue([
        {
          id: 'id-1',
          name: 'Found',
          description: 'desc',
          content: '# Found',
          status: 'active',
        },
      ]);

      const result = await resolver.resolveSkillsForAgent(TENANT_ID, [
        'id-1',
        'id-missing',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('id-1');
    });

    it('maps to SkillPromptPayload correctly', async () => {
      skillService.findByIds.mockResolvedValue([
        {
          id: 'id-1',
          name: 'Skill',
          description: 'desc',
          content: '# Content',
          status: 'active',
        },
      ]);

      const result = await resolver.resolveSkillsForAgent(TENANT_ID, ['id-1']);

      expect(result[0]).toEqual({
        id: 'id-1',
        name: 'Skill',
        description: 'desc',
        content: '# Content',
      });
    });
  });

  // ─── buildSkillAugmentedPrompt ─────────────────────────────────────────
  describe('buildSkillAugmentedPrompt', () => {
    it('returns base prompt when no skills', () => {
      const result = resolver.buildSkillAugmentedPrompt(
        'You are an assistant.',
        [],
      );
      expect(result).toBe('You are an assistant.');
    });

    it('includes summaries and full content for small skills', () => {
      const skills: SkillPromptPayload[] = [
        {
          id: 'id-1',
          name: 'Small',
          description: 'desc',
          content: 'short content',
        },
      ];

      const result = resolver.buildSkillAugmentedPrompt('Base prompt.', skills);

      expect(result).toContain('Base prompt.');
      expect(result).toContain('<available_skills>');
      expect(result).toContain('<skill name="Small">');
      expect(result).toContain('short content');
    });

    it('only includes summaries when content exceeds 50KB threshold', () => {
      const largeContent = 'x'.repeat(51 * 1024);
      const skills: SkillPromptPayload[] = [
        {
          id: 'id-1',
          name: 'Large',
          description: 'desc',
          content: largeContent,
        },
      ];

      const result = resolver.buildSkillAugmentedPrompt('Base prompt.', skills);

      expect(result).toContain('Base prompt.');
      expect(result).toContain('<available_skills>');
      expect(result).not.toContain('<skill name="Large">');
      expect(result).not.toContain(largeContent);
    });

    it('treats null content as zero size', () => {
      const skills: SkillPromptPayload[] = [
        { id: 'id-1', name: 'NullContent', description: 'desc', content: null },
      ];

      const result = resolver.buildSkillAugmentedPrompt('Base.', skills);

      expect(result).toContain('<available_skills>');
      expect(result).toContain('<skill name="NullContent">');
    });

    it('sums content of multiple skills for threshold check', () => {
      const halfThreshold = 'x'.repeat(26 * 1024);
      const skills: SkillPromptPayload[] = [
        { id: 'id-1', name: 'A', description: 'desc', content: halfThreshold },
        { id: 'id-2', name: 'B', description: 'desc', content: halfThreshold },
      ];

      const result = resolver.buildSkillAugmentedPrompt('Base.', skills);

      expect(result).toContain('<available_skills>');
      expect(result).not.toContain('<skill name="A">');
    });
  });
});
