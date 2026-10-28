import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'meteo', include: ['test/**/*.test.ts'], environment: 'node' }
})
