module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePathIgnorePatterns: [
    '<rootDir>/.tools/',
    '<rootDir>/.g/',
    '<rootDir>/apps/mobile/android/',
  ],
  testMatch: [
    '<rootDir>/packages/**/*.test.ts',
    '<rootDir>/apps/mobile/src/**/*.test.ts',
  ],
  moduleNameMapper: { '^@seleva/(.*)$': '<rootDir>/packages/$1/src' },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'CommonJS',
          esModuleInterop: true,
          strict: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
};
