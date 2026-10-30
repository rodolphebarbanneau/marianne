## The service

<!-- 3615 <CODE>: what it shows, for whom, and why it belongs in Marianne. Link the issue: "Fixes #123". -->

## Its data

<!--
Each host it declares (marianne.hosts): what it reads there, and the terms that data is published under (a licence, the site's conditions of use).
What it keeps: dataDir for public data only, ctx.storage for anything of the user's.
What of the profile it asks (marianne.permissions), and why.
-->

## How it was tested

<!-- Its tests (its parsers without the network, its main side through fakeContext, its tile through checkTile), and what you checked in the app. -->

## Screenshots

<!-- The screen at 1440, 800 and 520 pixels wide, its tile, its icon in the table and in « avant d’ajouter ». Hide anything personal. -->

## Checklist

- [ ] `npm run check` passes (Prettier, boundaries, type checks, tests)
- [ ] `services/<code>/`, named `@marianne/service-<code>`: its code in lowercase letters and digits, the folder's name
- [ ] Registered: in the `devDependencies` of `apps/desktop/package.json` and in both registries (`main/host/registry.ts`, `renderer/src/host/registry.ts`), `starter` decided
- [ ] It reaches only its declared hosts, never sees the user's identifiers, and acts on no website for the user (that goes through `host.ask`)
- [ ] Tabs: ids in English, labels in French and lowercase, each with its key; none for a screen of one page
- [ ] `src/help.md`: French, under 900 characters, no heading and no keys
- [ ] Icon: eight by eight, the palette's names only, readable at 24 pixels in every theme
- [ ] Tile: one figure or one title, two lines at most, `urgent` only for what is to do today; `checkTile` passes
- [ ] Every state shows something: a wait (`Loading`), a failure (offline), an empty sentence
- [ ] Checked with the sidebar open and folded, each tab with its key, and the guide (F1)
- [ ] Listed with the other services in the user guide, in every language (`docs/guide/<language>/using.md`)
- [ ] Built as `services/AGENTS.md` says, to the contract of `docs/services.md`
