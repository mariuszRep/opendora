export function splitArgsPreservingQuotes(
  input: string,
  opts: { escapeMode: "backslash" },
): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let escapeNext = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }

    if (opts.escapeMode === "backslash" && ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    args.push(current);
  }

  return args;
}
