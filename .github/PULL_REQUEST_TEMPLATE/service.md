<!--
For a service: a new one, or a change to one of services/<code>/.
The screenshots are required: a pull request without them waits for them.
-->

## The service

<!--
3615 <CODE>.
New: what it shows, for whom, and why it belongs in Marianne.
Changed: what changes, and why.
Link the issue: "Fixes #123".
-->

## Its data

<!--
Each host it declares (marianne.hosts): what it reads there, and the terms that data is published under (a licence, the site's conditions of use).
What it keeps: dataDir for public data only, ctx.storage for anything of the user's.
What of the profile it asks (marianne.permissions), and why.
For a change, only what changes; "Unchanged" if nothing does.
-->

## How it was tested

<!-- Its tests (its parsers without the network, its main side through fakeContext, its tile through checkTile), and what you checked in the app. -->

## Screenshots

<!--
Required. Invented names, addresses and numbers only; hide anything personal.
Pages: every page and tab the pull request creates or changes, one entry each, at 1440 pixels wide.
Say what each one lets the user do (a search, a filter, a dialog, a key), and show those features: one screenshot more when the page alone doesn't show one.
For a change: before and after. For a new service: its main page at 800 and 520 pixels wide too.
Drop them here, or write each as ![what it shows](shot:file.png) and run npm run pr:shots -- <number> --from <folder>.
-->

### Pages

- **[page or tab] ([its key])**: what it shows, and what the user can do there.

  <!-- Its screenshot, then one per feature the page alone doesn't show; before and after for a change. -->

### Its tile, pinned

<!--
The service pinned with its star, its tile at the top of « mes services » (Services, F2), as the user sees it on an ordinary day; if it can be urgent, urgent too.
For a change that leaves the tile as it was: "Unchanged", with its screenshot all the same.
-->

### Its icon

<!-- A new service, or a new icon: in the table of « mes services » and in « avant d’ajouter ». -->

## Checklist

- [ ] `npm run check` passes (Prettier, boundaries, type checks, tests)
- [ ] Screenshots: every page and tab created or changed, each with what it lets the user do, before and after for a change
- [ ] Screenshot of its tile pinned at the top of « mes services »
- [ ] A new service: `services/<code>/`, named `@marianne/service-<code>`, its code in lowercase letters and digits, the folder's name
- [ ] A new service: registered in the `devDependencies` of `apps/desktop/package.json` and in both registries (`main/host/registry.ts`, `renderer/src/host/registry.ts`), `starter` decided
- [ ] It reaches only its declared hosts, never sees the user's identifiers, and acts on no website for the user (that goes through `host.ask`)
- [ ] Tabs: ids in English, labels in French and lowercase, each with its key; none for a screen of one page
- [ ] `src/help.md`: French, under 900 characters, no heading and no keys
- [ ] Icon: eight by eight, the palette's names only, readable at 24 pixels in every theme
- [ ] Tile: one figure or one title, two lines at most, `urgent` only for what is to do today; `checkTile` passes
- [ ] Every state shows something: a wait (`Loading`), a failure (offline), an empty sentence
- [ ] Checked with the sidebar open and folded, each tab with its key, and the guide (F1)
- [ ] Listed with the other services in the user guide, in every language (`docs/guide/<language>/using.md`), and changed there if what the user sees changes
- [ ] Built as `services/AGENTS.md` says, to the contract of `docs/services.md`
