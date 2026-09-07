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
      // Los de modelos y los de integracion tienen su propio proyecto: los dos
      // necesitan el juego completo de modelos registrado, que bajo ESM no se
      // puede por las importaciones circulares.
      testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/tests/models/sql/',
        '<rootDir>/tests/integration/',
        '<rootDir>/tests/routes/',
      ],
    },
    {
      ...base,
      /**
       * Tests que llaman rutas de Express contra una base real.
       *
       * Estaban en el proyecto "esm", donde nadie registra los modelos, asi que
       * fallaban todos con "Model not initialized" desde el primer User.create().
       * No era un bug del codigo ni de los tests: estaban corriendo en el lugar
       * equivocado.
       *
       * Corre en serie: comparten la misma base y se pisan entre si si van en
       * paralelo.
       */
      displayName: 'integration',
      transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: false, isolatedModules: true }],
      },
      setupFiles: ['<rootDir>/tests/env.first.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.integration.ts'],
      testMatch: [
        '<rootDir>/tests/integration/*.test.ts',
        '<rootDir>/tests/routes/*.test.ts',
      ],
      maxWorkers: 1,
    },
    {
      ...base,
      displayName: 'models',
      transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: false, isolatedModules: true }],
      },
      setupFiles: ['<rootDir>/tests/env.first.ts'],
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
