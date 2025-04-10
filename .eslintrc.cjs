module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true }, // Add node: true for backend files
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier', // Uses eslint-config-prettier to disable ESLint rules that would conflict with Prettier
    'plugin:prettier/recommended', // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors.
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.ts', 'node_modules'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', '@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': 'warn', // Show Prettier issues as warnings
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    // Add any project-specific rules here
  },
  settings: {
    react: {
      version: 'detect' // Automatically detect the React version
    }
  }
}; 