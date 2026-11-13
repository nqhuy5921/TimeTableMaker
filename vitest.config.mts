import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/domain/**/*.test.ts',
      'tests/main/**/*.test.ts',
      'tests/renderer/**/*.test.ts',
    ],
    environment: 'node',
  },
});
