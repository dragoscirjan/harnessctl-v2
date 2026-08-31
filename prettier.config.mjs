import baseConfig from '@templ-project/prettier';

export default {
  ...baseConfig,
  overrides: [
    ...baseConfig.overrides,
    {
      files: '*.css',
      options: {
        parser: 'css',
      },
    },
  ],
};
