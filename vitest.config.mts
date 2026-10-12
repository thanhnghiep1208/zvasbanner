import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Giống "paths": { "@/*": ["./*"] } trong tsconfig.json
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
