import { defineConfig } from 'vitest/config'

/** Every package's tests: the app (apps/*), the packages (packages/*) and the services. */
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*', 'services/*']
  }
})
