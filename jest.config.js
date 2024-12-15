module.exports = {
  // Test environment
  testEnvironment: "node",

  // Test files pattern
  testMatch: ["**/__tests__/**/*.js", "**/?(*.)+(spec|test).js"],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "clover"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/tests/**",
    "!src/config/**",
    "!src/types/**",
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Test setup file
  setupFilesAfterEnv: ["<rootDir>/src/tests/setup.js"],

  // Module name mapper for absolute imports
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,
};
