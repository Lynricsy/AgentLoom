/**
 * ast-grep 语言表：内置语言（TypeScript/Tsx/JavaScript/Html/Css）随 @ast-grep/napi
 * 提供；其余语言来自 @ast-grep/lang-* 的预编译 parser.so，经 registerDynamicLanguage
 * 在首次使用时注册一次（napi 要求整个进程只调用一次）。
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Lang, registerDynamicLanguage, type DynamicLangRegistrations } from '@ast-grep/napi';

const require = createRequire(import.meta.url);

/** 动态语言名 → npm 包名 */
const DYNAMIC_LANGUAGE_PACKAGES = {
  python: '@ast-grep/lang-python',
  go: '@ast-grep/lang-go',
  rust: '@ast-grep/lang-rust',
  java: '@ast-grep/lang-java',
  c: '@ast-grep/lang-c',
  cpp: '@ast-grep/lang-cpp',
  json: '@ast-grep/lang-json',
  yaml: '@ast-grep/lang-yaml',
  bash: '@ast-grep/lang-bash',
} as const;

/** 扩展名 → ast-grep 语言名 */
const EXTENSION_LANGUAGES: Readonly<Record<string, string>> = {
  '.ts': Lang.TypeScript,
  '.mts': Lang.TypeScript,
  '.cts': Lang.TypeScript,
  '.tsx': Lang.Tsx,
  '.js': Lang.JavaScript,
  '.mjs': Lang.JavaScript,
  '.cjs': Lang.JavaScript,
  '.jsx': Lang.Tsx,
  '.html': Lang.Html,
  '.css': Lang.Css,
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sh': 'bash',
  '.bash': 'bash',
};

/** `lang` 参数的允许值（扩展名表的值去重） */
export const AST_LANGUAGES = [...new Set(Object.values(EXTENSION_LANGUAGES))] as [
  string,
  ...string[],
];

interface RegistrationState {
  /** 注册成功的动态语言 */
  readonly available: ReadonlySet<string>;
  /** 动态语言不可用的原因（parser.so 缺失、加载失败） */
  readonly failures: ReadonlyMap<string, string>;
}

let registration: RegistrationState | undefined;

/** 首次调用时注册全部可加载的动态语言；之后直接返回缓存结果 */
export function ensureLanguagesRegistered(): RegistrationState {
  if (registration) return registration;
  const langs: DynamicLangRegistrations = {};
  const failures = new Map<string, string>();
  for (const [name, pkg] of Object.entries(DYNAMIC_LANGUAGE_PACKAGES)) {
    try {
      const entry = require(pkg) as DynamicLangRegistrations[string];
      // libraryPath 是按平台解析的 getter，取值一次即可判断预编译包是否存在
      const libraryPath = entry.libraryPath;
      if (!existsSync(libraryPath)) {
        failures.set(name, `parser not found at ${libraryPath}`);
        continue;
      }
      langs[name] = { ...entry, libraryPath };
    } catch (error) {
      failures.set(name, error instanceof Error ? error.message : String(error));
    }
  }
  try {
    registerDynamicLanguage(langs);
    registration = { available: new Set(Object.keys(langs)), failures };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    for (const name of Object.keys(langs)) failures.set(name, reason);
    registration = { available: new Set(), failures };
  }
  return registration;
}

/** 按扩展名推断语言；无对应条目返回 undefined */
export function languageForFile(filePath: string): string | undefined {
  return EXTENSION_LANGUAGES[path.extname(filePath).toLowerCase()];
}

/**
 * 确认语言可用：内置语言总是可用；动态语言须已注册成功，否则抛出说明原因的错误。
 */
export function assertLanguageUsable(lang: string): void {
  if (!AST_LANGUAGES.includes(lang)) {
    throw new Error(`Unsupported lang "${lang}". Supported: ${AST_LANGUAGES.join(', ')}`);
  }
  if (!(lang in DYNAMIC_LANGUAGE_PACKAGES)) return;
  const state = ensureLanguagesRegistered();
  if (!state.available.has(lang)) {
    throw new Error(
      `ast-grep language "${lang}" is unavailable: ${state.failures.get(lang) ?? 'not registered'}`,
    );
  }
}
