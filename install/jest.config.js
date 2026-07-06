module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'lib/**/*.js',
    '!lib/templates/**',
    '!**/node_modules/**',
    // yanstaller surface without a dedicated coverage suite (exercised indirectly
    // via the CLI/webui, not gated here). The former Phase-2 stub modules that
    // used to sit here were excised.
    '!lib/yanstaller/backuper.js',
    '!lib/yanstaller/index.js',
    '!lib/errors.js',
    '!lib/exit-codes.js',
    '!lib/utils/config-loader.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  // Nested packages (e.g. packages/platform-config) own their own jest config
  // and test suite; install's jest must not collect them.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/packages/'
  ],
  verbose: true
};
