import { basename } from 'node:path/posix';

import { SkillFileNameInvalidException } from './skill.exceptions';

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * 校验并收口 Skill 文件名。
 *
 * 必须在取 basename 前检查原始路径段，否则 multipart 解析器或调用方会静默
 * 丢弃穿越信息，让危险输入伪装成普通文件名。
 */
export function validateAndCanonicalizeSkillFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const canonicalName = basename(normalized);

  if (
    !canonicalName ||
    segments.some((segment) => segment === '.' || segment === '..') ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new SkillFileNameInvalidException();
  }

  return canonicalName;
}
