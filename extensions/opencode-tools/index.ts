import { ConfigError, createConfig, getConfigValue, parseIssueId } from '@harnessctl/generic-tools';
import { tool, type Plugin } from '@opencode-ai/plugin';

export const CustomToolsPlugin: Plugin = async () => ({
  tool: {
    config_create: tool({
      description: 'Create .harnessctl/config.yaml with neutral defaults if absent.',
      args: {},
      async execute(_args, context) {
        try {
          return `Configuration ready: ${createConfig(context.directory)}`;
        } catch (error: unknown) {
          return formatError(error);
        }
      },
    }),
    config_get: tool({
      description: 'Read a value from .harnessctl/config.yaml using a dotted path.',
      args: {
        path: tool.schema.string().describe('Dotted configuration path, such as paths.tasks'),
      },
      async execute(args, context) {
        const value = getConfigValue(context.directory, args.path);
        return value instanceof ConfigError ? formatError(value) : JSON.stringify(value);
      },
    }),
    'issue-id': tool({
      description: 'Extract an issue ID from text using the project configuration.',
      args: {
        prompt: tool.schema.string().describe('Text containing an issue ID'),
      },
      async execute(args, context) {
        return parseIssueId(args.prompt, context.directory);
      },
    }),
  },
});

function formatError(error: unknown): string {
  return error instanceof Error ? `Configuration error: ${error.message}` : `Configuration error: ${String(error)}`;
}
