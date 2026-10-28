import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'annuaire', include: ['test/**/*.test.ts'], environment: 'node' }
})
