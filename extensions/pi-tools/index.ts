import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ConfigError, createConfig, getConfigValue, parseIssueId } from '@harnessctl/generic-tools';
import { Type } from 'typebox';

export default function harnessctlTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'config_create',
    label: 'Config Create',
    description: 'Create .harnessctl/config.yaml with neutral defaults if absent.',
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, context) {
      try {
        return {
          content: [
            {
              type: 'text',
              text: `Configuration ready: ${createConfig(context.cwd)}`,
            },
          ],
          details: {},
        };
      } catch (error: unknown) {
        return configurationError(error);
      }
    },
  });

  pi.registerTool({
    name: 'config_get',
    label: 'Config Get',
    description: 'Read a value from .harnessctl/config.yaml using a dotted path.',
    parameters: Type.Object({
      path: Type.String({ description: 'Dotted path, such as paths.tasks' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      const value = getConfigValue(context.cwd, params.path);
      return value instanceof ConfigError
        ? configurationError(value)
        : {
            content: [{ type: 'text', text: JSON.stringify(value) }],
            details: {},
          };
    },
  });

  pi.registerTool({
    name: 'issue_id',
    label: 'Issue ID',
    description: 'Extract an issue ID from text using the project configuration.',
    parameters: Type.Object({
      prompt: Type.String({ description: 'Text containing an issue ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      return {
        content: [
          {
            type: 'text',
            text: parseIssueId(params.prompt, context.cwd),
          },
        ],
        details: {},
      };
    },
  });
}

function configurationError(error: unknown): {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `Configuration error: ${message}` }],
    details: {},
  };
}
