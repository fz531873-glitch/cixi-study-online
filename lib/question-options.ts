export const optionLetters = ['A', 'B', 'C', 'D'] as const;

const optionLine = /^[ \t]*([A-D])[.．、][ \t]*(.+)$/;

export function splitQuestionOptions(body: string) {
  const lines = body.trimEnd().split(/\r?\n/);
  const first = lines.findIndex(line => optionLine.test(line));
  if (first <= 0) return null;

  const stem = lines.slice(0, first).join('\n').trimEnd();
  const options = lines.slice(first).filter(line => line.trim()).map(line => optionLine.exec(line));
  // shortcut: only separate four standalone options; support wrapped or inline options once stored separately.
  if (!stem || options.length !== optionLetters.length) return null;

  const choices: string[] = [];
  for (const [index, option] of options.entries()) {
    const text = option?.[2].trim();
    if (option?.[1] !== optionLetters[index] || !text || /[A-Z][.．、]/.test(text)) return null;
    choices.push(text);
  }
  return { stem, choices };
}
