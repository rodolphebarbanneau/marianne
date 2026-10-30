# 3615 BONJOUR

An example of a community service for Marianne, to copy: one tool for the engines, a tile, a one-page screen made of the SDK's blocks, an 8 × 8 icon, a help.

```
package.json      the manifest (the "marianne" field), its tools declared
src/main.ts       its main side: methods for its screen, the tool, the tile
src/view.tsx      its screen
src/view.css      its styles, prefixed with its code
src/help.md       its help, in Marianne's guide (F1)
test/             its tests (vitest, @marianne/sdk/testing)
```

Pack it into a `.3615` file, which Marianne adds from « découvrir › ajouter un fichier .3615 »:

```
node packages/sdk/scripts/pack.mjs packages/sdk/examples/bonjour
```

The file is written to `dist/bonjour.3615`. How to build a service well: [services/AGENTS.md](../../../../services/AGENTS.md); the contract: [docs/services.md](../../../../docs/services.md).
