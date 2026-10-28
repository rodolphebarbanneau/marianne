import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'carte', include: ['test/**/*.test.ts'], environment: 'node' }
})
