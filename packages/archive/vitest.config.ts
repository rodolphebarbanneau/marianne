import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'archive', include: ['test/**/*.test.ts'], environment: 'node' }
})
