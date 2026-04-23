/**
 * Stryker configuration for Vite + Vitest + React (custom setup)
 */

// Stryker configuration for Vite + Vitest + React (custom setup)

/** @type {import('@stryker-mutator/core').StrykerOptions} */
module.exports = {
  mutate: [
    'src/pages/*.jsx',
    '!src/setupTests.js'
  ],
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  tempDirName: '.stryker-tmp',
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  concurrency: 10,
  thresholds: {
    high: 80,
    low: 60,
    break: 30
  }
};
