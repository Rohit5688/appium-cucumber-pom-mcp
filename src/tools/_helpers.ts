export function textResult(text: string, structured?: Record<string, unknown>) {
  const result: any = { content: [{ type: "text" as const, text }] };
  if (structured) result.structuredContent = structured;
  return result;
}

const CHARACTER_LIMIT = 25_000;
export function truncate(text: string, tip?: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const suffix = tip
    ? `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars. Tip: ${tip}]`
    : `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars]`;
  return text.slice(0, CHARACTER_LIMIT) + suffix;
}
