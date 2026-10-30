import { defineProject } from 'vitest/config'

export default defineProject({
  test: { name: 'infos', include: ['test/**/*.test.{ts,tsx}'], environment: 'node' }
})
