module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'lib/**/*.js',
    '!lib/templates/**',
    '!**/node_modules/**',
    // Exclude Phase 2+ modules (not implemented yet)
    '!lib/yanstaller/installer.js',
    '!lib/yanstaller/wizard.js',
    '!lib/yanstaller/interviewer.js',
    '!lib/yanstaller/backuper.js',
    '!lib/yanstaller/validator.js',
    '!lib/yanstaller/recommender.js',
    '!lib/yanstaller/troubleshooter.js',
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
