import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeCjkRadicals } from '../parsers/cjk-radical-normalizer';
import { PdfParser } from '../parsers/pdf.parser';

const RADICAL_PATTERN = /[\u2E80-\u2EFF\u2F00-\u2FDF]/u;

// 仓库内的宣传册 PDF（Noto CJK SC 字体），pdf-parse 直接抽取会混入 1000+ 个部首字符
const BROCHURE_PDF = resolve(
  __dirname,
  '../../../../../brochure/AgentLoom-系统介绍.pdf',
);

describe('normalizeCjkRadicals', () => {
  it('康熙部首与 CJK 部首补充字符还原为常用汉字', () => {
    expect(
      normalizeCjkRadicals('同⼀主 Agent 最多同时运⾏ 10 个⼦ Agent'),
    ).toBe('同一主 Agent 最多同时运行 10 个子 Agent');
    expect(normalizeCjkRadicals('⻔户⻆⾊⻓度⻚⾯⻅⻛')).toBe(
      '门户角色长度页面见风',
    );
  });

  it('康熙部首 DOOR 映射为简体「户」', () => {
    expect(normalizeCjkRadicals('⽤⼾')).toBe('用户');
  });

  it('全角标点、圈号数字、省略号与普通汉字保持原样', () => {
    const text = '用户，你好：（一）；可以吗？①②…「引用」、。　ＡＢ';
    expect(normalizeCjkRadicals(text)).toBe(text);
  });
});

describe('PdfParser（宣传册回归样本）', () => {
  it('抽取的文本不含部首字符，全角标点保留', async () => {
    const parsed = await new PdfParser().parse(
      readFileSync(BROCHURE_PDF),
      'AgentLoom-系统介绍.pdf',
    );

    expect(parsed.fullText).not.toMatch(RADICAL_PATTERN);
    expect(parsed.fullText).toContain('同一主 Agent 最多同时');
    expect(parsed.fullText).toContain('用户');
    expect(parsed.fullText).toContain('，');
    expect(parsed.fullText).toContain('（');
    for (const section of parsed.sections) {
      expect(section.text).not.toMatch(RADICAL_PATTERN);
      // 偏移基于归一化后的全文，仍能回指原段落
      expect(
        parsed.fullText.slice(
          section.location.charOffset,
          section.location.charOffset + section.text.length,
        ),
      ).toBe(section.text);
    }
  });
});
