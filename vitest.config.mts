import { defineConfig } from 'vitest/config'

/** Every package's tests: the app (apps/*), the packages (packages/*) and the services (each folder's config: services/ holds their guide too). */
export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*', 'services/*/vitest.config.ts']
  }
})
