module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: [
      '@typescript-eslint',
    ],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier',
    ],
    // typescript-eslint 4 switches off the core rules the type checker already covers - no-undef
    // among them - for *.ts and *.tsx only, because it predates .mts. vitest.config.mts is the one
    // .mts file, so it gets the same set, taken from the plugin rather than copied.
    overrides: [
      {
        files: ['*.mts'],
        rules: require('@typescript-eslint/eslint-plugin').configs['eslint-recommended'].overrides[0].rules,
      },
    ],
  };
