import { defineProject } from 'vitest/config'

export default defineProject({
  // The example community service's tests too (examples/bonjour: a service to copy).
  test: { name: 'sdk', include: ['test/**/*.test.ts', 'examples/*/test/**/*.test.ts'], environment: 'node' }
})
