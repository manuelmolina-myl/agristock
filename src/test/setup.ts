/**
 * Vitest global setup.
 *
 * Importing `@testing-library/jest-dom/vitest` extends Vitest's `expect` with
 * DOM matchers like `toBeInTheDocument()` and `toHaveTextContent()`.  This is
 * imported via `vitest.config.ts → test.setupFiles`, so every test file gets
 * the matchers for free.
 */
import '@testing-library/jest-dom/vitest'
