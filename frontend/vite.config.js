import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Transform jest.* calls to vi.* in test files so Vitest can hoist vi.mock()
// correctly. Also fixes ESM interop: vi.mock factories returning bare functions
// must return { default: fn } in Vitest (unlike Jest/CJS mode).
function jestCompatPlugin() {
  return {
    name: 'vitest-jest-compat',
    enforce: 'pre',
    transform(code, id) {
      // Apply to any test/spec file in the project (not inside node_modules).
      if (id.includes('node_modules')) return
      if (!id.endsWith('.test.js') && !id.endsWith('.spec.js') && !id.includes('/__tests__/')) return

      let result = code
        .replace(/\bjest\.mock\(/g, 'vi.mock(')
        .replace(/\bjest\.fn\b/g, 'vi.fn')
        .replace(/\bjest\.spyOn\b/g, 'vi.spyOn')
        .replace(/\bjest\.clearAllMocks\b/g, 'vi.clearAllMocks')
        .replace(/\bjest\.restoreAllMocks\b/g, 'vi.restoreAllMocks')
        .replace(/\bjest\.resetAllMocks\b/g, 'vi.resetAllMocks')
      // Wrap single-line vi.mock factories that return a bare arrow function in
      // { default: fn } for ESM default-export interop.
      // Matches:  vi.mock('path', () => () => EXPR);
      // Produces: vi.mock('path', () => ({ default: () => EXPR }));
      // Note: `.+` uses the `m` flag so it never matches across lines; complex
      // multi-line factories are not affected.
      result = result.replace(
        /^(\s*vi\.mock\([^,]+,\s*)\(\)\s*=>\s*(\(\)\s*=>)(.+)(\);)\s*$/gm,
        (_m, prefix, innerArrow, expr, closing) =>
          `${prefix}() => ({ default: ${innerArrow}${expr} })${closing}`,
      )
      // source map not generated: replacements are positionally trivial and
      // only affect test infrastructure boilerplate, not business logic.
      return { code: result, map: null }
    },
  }
}


export default defineConfig({
  plugins: [react(), jestCompatPlugin()],
  esbuild: {
    include: /src\/.*\.js$/,
    loader: 'jsx',
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': 'http://localhost:8000',
      '/mcp': 'http://localhost:8000',
    },
  },
  build: {
    outDir: 'build',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
