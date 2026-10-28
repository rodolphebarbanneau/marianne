import { defineConfig } from 'vitest/config'

/** Every package's tests: the app (apps/*), the content, the SDK (packages/*) and the services. */
export default defineConfig({
  test: {
    projects: ['apps/*', 'content', 'packages/*', 'services/*']
  }
})
