// Two jest projects:
//  - "esm": default. Most tests use ESM features (jest.unstable_mockModule, top-level
//    await) and/or import modules that use import.meta — they must run as ESM.
//  - "models": the Sequelize model tests. These need the FULL model set registered,
//    which triggers a circular-import TDZ ("Cannot access 'Payment' before
//    initialization") under ESM. CommonJS tolerates the cycle, so model tests are
//    transpiled to CJS and register all models via tests/setup.models.ts.
const base = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30000,
};

export default {
  projects: [
    {
      ...base,
      displayName: 'esm',
      extensionsToTreatAsEsm: ['.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: true, isolatedModules: true }],
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testMatch: ['**/tests/**/*.test.ts', '**/server/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/models/sql/'],
    },
    {
      ...base,
      displayName: 'models',
      transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: false, isolatedModules: true }],
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.models.ts'],
      testMatch: ['<rootDir>/tests/models/sql/*.test.ts'],
    },
  ],
  collectCoverageFrom: [
    'server/**/*.ts',
    '!server/index.ts',
    '!server/**/*.d.ts',
    '!server/scripts/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
