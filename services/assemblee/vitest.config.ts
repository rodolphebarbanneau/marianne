import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'assemblee', include: ['test/**/*.test.ts'], environment: 'node' }
})
