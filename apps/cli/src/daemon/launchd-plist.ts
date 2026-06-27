export function buildLaunchAgentPlist({
  label,
  comment,
  programArguments,
  workingDirectory,
  stdoutPath,
  stderrPath,
  environment,
}: {
  label: string
  comment?: string
  programArguments: string[]
  workingDirectory?: string
  stdoutPath: string
  stderrPath: string
  environment?: Record<string, string | undefined>
}): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
  ]

  if (comment) {
    lines.push(`  <!-- ${comment} -->`)
  }

  lines.push(`  <key>Label</key>`)
  lines.push(`  <string>${escapeXml(label)}</string>`)
  lines.push(`  <key>ProgramArguments</key>`)
  lines.push(`  <array>`)
  for (const arg of programArguments) {
    lines.push(`    <string>${escapeXml(arg)}</string>`)
  }
  lines.push(`  </array>`)

  if (workingDirectory) {
    lines.push(`  <key>WorkingDirectory</key>`)
    lines.push(`  <string>${escapeXml(workingDirectory)}</string>`)
  }

  if (environment && Object.keys(environment).length > 0) {
    lines.push(`  <key>EnvironmentVariables</key>`)
    lines.push(`  <dict>`)
    for (const [key, value] of Object.entries(environment)) {
      if (typeof value === "string") {
        lines.push(`    <key>${escapeXml(key)}</key>`)
        lines.push(`    <string>${escapeXml(value)}</string>`)
      }
    }
    lines.push(`  </dict>`)
  }

  lines.push(`  <key>RunAtLoad</key>`)
  lines.push(`  <true/>`)
  lines.push(`  <key>KeepAlive</key>`)
  lines.push(`  <true/>`)
  lines.push(`  <key>StandardOutPath</key>`)
  lines.push(`  <string>${escapeXml(stdoutPath)}</string>`)
  lines.push(`  <key>StandardErrorPath</key>`)
  lines.push(`  <string>${escapeXml(stderrPath)}</string>`)
  lines.push('</dict>')
  lines.push('</plist>')

  return lines.join('\n')
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function readLaunchAgentProgramArgumentsFromFile(plistPath: string): Promise<any> {
  // Simplified - would need plist parser in real implementation
  return null
}
