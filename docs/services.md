# Services

Services are the apps of the Services page, the 3615 codes: 3615 METEO, 3615 PARLEMENT… Each one is an add-on: a package of its own that depends on `@marianne/sdk` and on nothing of the app. Marianne hosts them; they never reach into it. How to build one well (the frame Marianne draws, the blocks to compose a screen from, the states and the design): [services/AGENTS.md](../services/AGENTS.md).

## The repository

```
packages/sdk/          @marianne/sdk: the contract between Marianne and its services
services/<code>/       @marianne/service-<code>: one built-in service
  package.json         its manifest, in the "marianne" field
  src/main.ts          its main-process side          (@marianne/sdk/main)
  src/sync.ts          its background sync, if any     (@marianne/sdk/sync)
  src/view.tsx         its screen                      (@marianne/sdk/view)
  src/help.md          its help, in Marianne's guide (F1 on its screen)
  src/…                its own modules (types, data, parsers, styles)
  test/                its tests (vitest, with @marianne/sdk/testing)
apps/desktop/src/main/host/          the host, main-process side
apps/desktop/src/renderer/src/host/  the host, window side
```

The repository is an npm workspace: `apps/*`, `packages/*` and `services/*`. A service imports Marianne by name (`@marianne/sdk`, `@marianne/sdk/main`…) and its own files by relative path, as any package does; `npm run check` fails on a service that imports anything else of Marianne (`scripts/check-boundaries.mjs`).

## Naming

A service's code is lowercase letters and digits, without accents: `meteo`, `parlement`. It is the folder's name, the package's name (`@marianne/service-meteo`), the service's id, and in capitals what follows 3615 (3615 METEO). The host refuses a package whose name and code disagree.

## The manifest

```json
{
  "name": "@marianne/service-meteo",
  "version": "1.0.0",
  "exports": { "./package.json": "./package.json", "./main": "./src/main.ts", "./view": "./src/view.tsx", "./help": "./src/help.md" },
  "marianne": {
    "code": "meteo",
    "name": "Météo",
    "description": "le temps de votre commune, maintenant et sur 7 jours",
    "category": "daily",
    "tabs": [],
    "keywords": ["temps", "pluie"],
    "connections": ["geo"],
    "hosts": ["api.open-meteo.com"],
    "links": [],
    "domains": []
  }
}
```

- `category`: one of `SERVICE_CATEGORIES` (the Services page groups by them).
- `tabs`: the tabs of its screen, in their order, at most `MAX_TABS` (8): `[{ "id": "ballots", "label": "scrutins" }]`, ids lowercase letters, digits and hyphens, labels French and lowercase. Marianne draws the bar under the 3615 header, fixed while the content scrolls, and gives each tab its function key: F2 for the first, then F3… (`tabKey(i)`; F1 is GUIDE). None, or one, and the screen has no bar.
- `connections`: Marianne's connections the service relies on (`geo` for the communes); it is unavailable while one is off.
- `hosts`: every host the service reaches, from any side. The main side's network, the sync job's downloads and the window's content policy only allow these.
- `links`: URL prefixes the service opens itself; a link in an answer that starts with one opens the service with `params.url`.
- `domains`: the domains it is useful for (`DOMAIN_IDS`: identity, family, health, taxes, work, retirement, housing, mobility, justice, business). Their dashboards show its line, and its deadlines must belong to one of them.
- `permissions`: what of the user's profile it asks to read, among `PROFILE_FIELDS` (`vehicles.plate`, `vehicles.model`…, `opinions.leaning`, `opinions.themes`), and what for, in one French line: `{ "profile": ["vehicles.plate"], "purpose": "retrouver vos passages en flux libre" }`. The first time the user opens the service, Marianne asks them, field by field; they can take it back in the settings. Nothing else of the profile is ever available to a service.

### Opinions

The user may say, in Réglages › Identité, which political groups they feel close to (`opinions.leaning`: acronyms of each chamber's groups, from the content's `parliament.json`) and which themes matter to them (`opinions.themes`: ids of `THEMES`, `ecology`, `housing`…). Both are optional, never inferred, and the leaning is sensitive data (RGPD, article 9): a service reads them only when it asked and the user accepted, and Réglages › Identité lists those services with the day each last read them. Engines never receive them.

- Use a leaning to compare, never to sort, hide or recommend: "votre députée a voté comme vos idées dans 82 % des cas", and offer the other side as well.
- Themes say nothing of an opinion: they bring matching content forward. `themesOf(text, themes)` (`@marianne/sdk`) tells which themes a text is about, by their words.

## Domains, guided démarches and services

The domains are Marianne's: the fixed themes of the user's file (identity, health, taxes… mobility), each with its dashboard. A service says which domains it helps with; Marianne never lists services. A guided démarche can send the user to a service in one of its steps (`> service: peage | Ouvrir 3615 PEAGE`); when that service is off, the step says so. A domain's dashboard suggests its services, and never turns one on by itself.

- A package with a sync job exports `"./sync"` too.
- `"./help"`: a few lines of Markdown (French, under 900 characters, no heading) that Marianne's guide shows on the service's screen, between its header and its keys.

`readManifest(pkg)` validates it; the host leaves out a service whose manifest is wrong, and says why in the log.

## Main side

`src/main.ts` exports `service`, made with `defineService`. Marianne calls `activate(ctx)` once, at start.

```ts
import { defineService, defineTool } from '@marianne/sdk/main'
import * as z from 'zod'
import type { MeteoMethods } from './types'

export const service = defineService<MeteoMethods>({
  activate(ctx) {
    return {
      methods: { forecast: (code) => forecast(ctx, code) },
      tools: [defineTool({ name: 'forecast', label: 'prévisions', description: '…', input: { commune: z.string() }, readOnly: true, run: … })]
    }
  }
})
```

The context is all a service gets of Marianne:

| `ctx.`     | what                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `manifest` | its manifest                                                                                     |
| `http`     | `json`, `text`, `page` (as a browser): HTTPS to its declared hosts only, Marianne's user agent   |
| `log`      | Marianne's log, prefixed with the service                                                        |
| `storage`  | the user's data for it (favorites…), in the encrypted archive; throws while locked               |
| `dataDir`  | a folder of this computer for its public data (its sync job fills it); never personal data       |
| `geo`      | `findCommunes`, `getCommune`: the communes of France                                             |
| `home()`   | the commune of the user's address, or null                                                       |
| `profile`  | `granted()`, `vehicles()`, `leaning()`, `themes()`: the fields the user granted it, nothing else |
| `sync`     | `status()` and `run()` of its sync job                                                           |

`activate` returns the runtime:

- `methods`: what its view calls. Declare them as a `type` (an `interface` lacks the index signature `ServiceMethods` needs) in the package (`{ forecast(code: string): Forecast }`) and pass it to `defineService`: the view's calls are checked against it. Arguments and results cross processes: plain data only.
- `tools`: tools the engines may call while the service is on. Engines see them as `<code>_<name>` (`parlement_ballots`). `label` is French, as the conversation shows the call; `description` and results are English, for the model. Arguments never carry the user's identifiers: the host refuses `[[tokens]]` in them. Throw `ToolError` for a failure the model should read (nothing found, a missing argument).
- `skills`: guides the engines read when a request calls for them, Markdown with a front matter (`name`, `title`, `description`); import them as text (`import guide from './skills/x.md?raw'`).
- `instructions`: a few lines (English) added to the engines' instructions while the service is on.
- `today(day)`: its lines of "Aujourd'hui" on the Actualités page (`TodayItem`); opening one opens the service with its `params`.
- `summary(domain)`: its line on the dashboard of one of its domains (`ServiceSummary`: a French sentence, an urgency, the `params` to open it with), or null. It is data: Marianne lays out every service's line the same way.
- `deadlines()`: the deadlines it knows of (`ServiceDeadline`), from what it keeps in `ctx.storage`; they join the user's deadlines and reminders. Called often: no network.
- `synced()`: its sync job has just written new data (reopen a database…).

## Sync job

A service with open data to keep offline (the Assemblée's deputies, ballots and agenda) has a sync job: `src/sync.ts`, a module that calls `runSync`, and `sync: { everyHours }` in its `defineService`.

```ts
import { runSync } from '@marianne/sdk/sync'

runSync(async (ctx) => {
  const file = await ctx.download('https://data.example.fr/dump.zip')
  if (!file) return null // unchanged since the last sync
  // … parse, write into ctx.dataDir (a SQLite file…), report ctx.progress(…)
  return { summary: '577 députés, 5 210 scrutins' }
})
```

Marianne builds it as its own entry (`out/main/sync-<code>.js`) and runs it in an Electron utility process, away from the app: when the service is on and its data is older than `everyHours`, and when the user asks. Downloads are conditional (ETag) and limited to the declared hosts; temporary files are removed after the run. `download(url, { force, label, optional })`: `force` downloads even when unchanged, `label` names it in the progress, `optional` returns null for a file the site doesn't have (404) instead of failing the run. The last run is kept in `<dataDir>/sync.json`. Write the data atomically (a transaction, or a new file renamed over the old one): the main side may read while the job runs.

## View

`src/view.tsx` exports `View`, a React component. Marianne shows it in the service's frame: the 3615 header (the way back to the Services page, its name, its star) and the tabs its manifest declares, both running the window's width and staying where they are; under them, the screen scrolls in a centred column (at most `--content-width`, 1280px) whose scroll bar is the window's edge. The view shows what the tab holds (`useTab`), and draws neither a header nor a bar. Fill the column rather than giving the screen a width of its own, and lay it out by the column's width, not the window's: it is a container named `service` (`@container service (max-width: 760px) { … }`), so a layout answers to the room the sidebar leaves it, on a wide screen as on a tablet.

```tsx
import { Spinner, useCall, useHost, useStored } from '@marianne/sdk/view'
import type { MeteoMethods } from './types'
import './view.css'

export function View() {
  const host = useHost<MeteoMethods>()
  const { data, error, loading } = useCall<MeteoMethods, 'forecast'>('forecast', host.home ? [host.home.code] : null)
  …
}
```

- `useHost()`: the manifest, `call(method, …args)`, `params` (what it was opened with), `home`, `ask(text, page?)` (hand a question to Marianne: a new folder, the question in the composer), `openRoute(route)` (another screen: `settings/identity`, `service/carte`), `openUrl`, `copy`, `toast`, `load(key)`/`save(key, value)` (the same storage as `ctx.storage`).
- `useCall(method, args)`: a method's result, loaded again when the arguments change (the previous result is dropped meanwhile); `null` arguments wait. Loaded again with the same arguments (`reload()`, or Marianne giving the screen a new host when what it may read changes), it keeps the previous result until the new one comes: a player or a list stays on screen.
- `useStored(key, defaults)`: stored data with defaults, and a function that merges, shows and stores.
- `useTab(onPick?)`: `{ tab, tabs, open(id) }`, the tab shown (`''` without tabs) and a way to show another; `onPick` runs whenever the user picks a tab, the one shown included (a screen with panes over its tabs closes them). Marianne scrolls back to the top on a new tab. The screen opens on the tab its `params.tab` names, else the first.
- `useTabBadges({ members: '3' })`: a short count beside tabs. `<ServiceTools>`: a few controls of the whole screen at the end of the tab bar (of the header, without tabs).
- `Loading` (`label`, `progress` from 0 to 1, `detail`; `inline` for a part of a page), `Failure` (`title`, `error`, `retry`; `inline`), `Notice` (a note with its `action`): the states of a page, the same in every service (see [services/AGENTS.md](../services/AGENTS.md)). `useDebounced(value, ms)`, `useNow(everyMs)`.
- `Spinner`, `Field`, `Modal`: the window's blocks (a `Modal` opens over the whole window, out of the screen's layout). Marianne's stylesheet styles them and the usual classes (`.card`, `.grid`, `.btn`, `.rows`, `.dim`…); a service's own styles go in a CSS file its view imports, with class names prefixed by its code (`.meteo-days`).

## Registration

A built-in service is a dependency of the app (`"@marianne/service-<code>": "*"` in the `devDependencies` of `apps/desktop/package.json`), listed in its two registries: `apps/desktop/src/main/host/registry.ts` (package.json and main) and `apps/desktop/src/renderer/src/host/registry.ts` (view and help). The build bundles it, and takes from it its sync job and the hosts the window may reach: nothing of it is loaded from disk at run time. The app's tests check that the dependencies and both registries agree.

## What a service may not do

- Import anything of the app (`apps/desktop`): only `@marianne/sdk`, its own files and its own dependencies.
- Reach a host it hasn't declared, from any side.
- See the user's identifiers. It gets the commune of their address, the profile fields they granted it, and what they store in it.
- Act on a website for the user: a payment, a signature, a form go through Marianne (`host.ask`), in the built-in browser, with the user's approval.
- Keep personal data outside `ctx.storage` (the encrypted archive): `dataDir` is for public data.

## Tests

Each package has its own `test/` and `vitest.config.ts`; `npm test` at the root runs the app's tests and every package's (vitest projects). Test the pure parts (parsers, queries, formatting) without the network; the main side through `fakeContext` from `@marianne/sdk/testing`, built from the service's package.json (`fakeContext(pkg, { answer, communes, profile })`: the network's answers, which it records, a storage in memory, the communes and the profile fields given); a sync job's logic through `execute` from `@marianne/sdk/sync`, with a fake `download`. `npm run typecheck` checks the app and each package (`tsc -p services/<code>`).

## Later: community services

The contract is meant to outlive the built-ins: `@marianne/sdk` would be published, community services would live in a repository of their own (contributions by pull request) and be installed from it. What it will take: publishing the SDK (types, the view helpers, `runSync`), loading a service's built bundle at run time instead of bundling it, and showing the user its hosts and connections before installing it.
