/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config'
import path from 'path'
import react from '@vitejs/plugin-react'

/**
 * Vitest configuration.
 *
 * We deliberately do NOT import `vite.config.ts` here — that config pulls in
 * `vite-plugin-pwa` and `@tailwindcss/vite`, neither of which are needed to
 * execute unit tests and both of which add noisy build steps to every run.
 * We re-declare the bits the test runtime cares about (the React plugin and
 * the `@` path alias) and keep this file self-contained.
 */
export default mergeConfig(
  {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  },
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      css: false,
    },
  }),
)
