import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'profile', include: ['test/**/*.test.ts'], environment: 'node' }
})
