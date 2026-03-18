import '@testing-library/jest-dom';

const { TextEncoder, TextDecoder } = require('util');

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

// react-router-dom@7.13.1 declares a non-existent "main" entry, and CRA/Jest
// (react-scripts@5) resolves that field first. Provide a virtual module that
// proxies to react-router's concrete CommonJS build used by v7.
jest.mock('react-router-dom', () => require('../node_modules/react-router/dist/development/index.js'), {
  virtual: true,
});
