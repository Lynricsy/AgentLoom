const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mjs: "javascript",
  cjs: "javascript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  kts: "kotlin",
  sh: "bash",
  zsh: "bash",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  html: "xml",
  htm: "xml",
  svg: "xml",
  xml: "xml",
  json: "json",
  css: "css",
  sql: "sql",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  swift: "swift",
  php: "php",
  Dockerfile: "dockerfile",
  toml: "ini",
  ini: "ini",
  diff: "diff",
  patch: "diff",
  txt: "plaintext",
};

export function detectLanguage(fileName: string): string | undefined {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0) {
    const baseName = fileName.split("/").pop() ?? fileName;
    return EXTENSION_TO_LANGUAGE[baseName];
  }
  const ext = fileName.slice(lastDot + 1);
  return EXTENSION_TO_LANGUAGE[ext];
}
