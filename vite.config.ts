import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/SlimeTime/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/sim/**/*.ts', 'src/render/renderSnapshot.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
