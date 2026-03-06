import { randomBytes } from 'node:crypto';

// CJK 统一汉字 + 扩展A: U+4E00–U+9FFF, U+3400–U+4DBF
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;

const LATIN_ALPHANUMERIC_REGEX = /[a-z0-9]/;

function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

// lowercase → special→hyphen → consecutive→single → trim → max 100 → CJK-only fallback
export function generateSlug(name: string): string {
  let slug = name.toLowerCase();
  slug = slug.replace(/[^a-z0-9\u4e00-\u9fff\u3400-\u4dbf]+/g, '-');
  slug = slug.replace(/-+/g, '-');
  slug = slug.replace(/^-|-$/g, '');
  slug = slug.slice(0, 100);
  slug = slug.replace(/-$/g, '');
  if (!slug || (CJK_REGEX.test(slug) && !LATIN_ALPHANUMERIC_REGEX.test(slug))) {
    slug = `org-${randomHex(8)}`;
  }

  return slug;
}

export function appendSlugSuffix(slug: string): string {
  const suffix = randomHex(4);
  const maxBaseLength = 100 - 1 - suffix.length;
  const base = slug.slice(0, maxBaseLength);
  return `${base}-${suffix}`;
}
