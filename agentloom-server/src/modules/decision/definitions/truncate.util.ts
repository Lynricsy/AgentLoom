/** 按字符数截断，超出时以省略号结尾（结果长度不超过 maxChars） */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars - 1)}…`;
}
