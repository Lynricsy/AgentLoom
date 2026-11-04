/**
 * 截断过长的工具输出文本，并注明被省略的字符数。
 * @param label 出现在截断提示里的来源名（如 stdout），可空
 */
export function capText(text: string, maxChars: number, label?: string): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  const source = label ? `${label} ` : '';
  return `${text.slice(0, maxChars)}…[${source}truncated, ${omitted} chars omitted]`;
}
