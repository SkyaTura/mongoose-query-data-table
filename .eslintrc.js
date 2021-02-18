module.exports = {
  root: true,
  extends: [
    '@emiolo/eslint-config/node',
    '@emiolo/eslint-config/ts',
  ],
  ignorePatterns: ['node_modules/', 'tests/', 'dist/', 'lib/', 'public/'],
  rules: {
    'func-names': ['off'],
    'import/prefer-default-export': ['off'],
    'import/no-unresolved': ['off'],
    'import/extensions': ['off'],
    '@typescript-eslint/member-delimiter-style': ['off'],
    '@typescript-eslint/ban-ts-ignore': ['off'],
    '@typescript-eslint/no-explicit-any': ['off'],
  },
}
