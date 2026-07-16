import { ConfigError, getConfigValue } from './config.js';

export function parseIssueId(prompt: string, cwd: string = process.cwd()): string {
  const configuredPattern = getConfigValue(cwd, 'issues.pattern');
  if (
    configuredPattern instanceof ConfigError ||
    typeof configuredPattern !== 'string' ||
    configuredPattern.length === 0
  ) {
    return '';
  }

  const pattern = configuredPattern.replaceAll('*', '\\d+');
  try {
    return prompt.match(new RegExp(pattern))?.[0] ?? '';
  } catch {
    return '';
  }
}
