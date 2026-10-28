import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'peage', include: ['test/**/*.test.ts'], environment: 'node' }
})
