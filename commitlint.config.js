/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'scope-enum': [
      2,
      'always',
      [
        'seed',
        'db',
        'extract',
        'reconcile',
        'ai',
        'ui',
        'api',
        'infra',
        'ci',
        'deps',
        'docs',
        'output',
        'trace',
        'repo',
        'specs',
        'readme',
      ],
    ],
    'header-max-length': [2, 'always', 100],
  },
};

export default config;
