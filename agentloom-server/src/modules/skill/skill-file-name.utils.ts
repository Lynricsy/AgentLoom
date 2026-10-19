import { SkillFileNameInvalidException } from './skill.exceptions';

// 这里的控制字符正是校验目标：文件名含 C0/DEL 时必须拒绝。
// eslint-disable-next-line no-control-regex -- 故意匹配控制字符
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:$/;

/**
 * 校验并规范化 Skill 文件路径，返回以 `/` 分隔的相对路径。
 *
 * Skill 包里 `scripts/run.sh`、`references/guide.md` 这类相对路径会被 SKILL.md
 * 引用，必须原样保留；因此这里不取 basename，而是逐段拒绝绝对路径、盘符、
 * 空段、`.`/`..` 与控制字符，确保结果只能落在 Skill 自己的对象前缀之下。
 */
export function validateAndCanonicalizeSkillFileName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/');
  const segments = normalized.split('/');

  if (
    !normalized ||
    CONTROL_CHARACTER_PATTERN.test(normalized) ||
    WINDOWS_DRIVE_PATTERN.test(segments[0]) ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new SkillFileNameInvalidException();
  }

  return segments.join('/');
}
