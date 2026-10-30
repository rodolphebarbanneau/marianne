import { registerHooks } from 'node:module'

/**
 * Lets plain Node run the content's TypeScript, and the SDK's it imports, without a loader to
 * install. Node strips the types itself, but resolves a relative import only by its full name, and
 * the sources write theirs without an extension ('./palette'), as the type checker and the bundlers
 * take them. So a relative import that isn't found is tried again as a .ts file, then as a folder's
 * index.ts. Imported first, before anything of the content.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.\.?\//.test(specifier)) throw err
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context)
        } catch {
          // Not under this name: the next one.
        }
      }
      throw err
    }
  }
})
