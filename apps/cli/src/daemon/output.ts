export const toPosixPath = (value: string) => value.replace(/\\/g, "/");

export function formatLine(label: string, value: string): string {
  return `${label}: ${value}`;
}

export function writeFormattedLines(
  stdout: NodeJS.WritableStream,
  lines: Array<{ label: string; value: string }>,
  opts?: { leadingBlankLine?: boolean },
): void {
  if (opts?.leadingBlankLine) {
    stdout.write("\n");
  }
  for (const line of lines) {
    stdout.write(`${formatLine(line.label, line.value)}\n`);
  }
}
