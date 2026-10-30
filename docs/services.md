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
    "domains": [],
    "tools": [{ "name": "forecast", "label": "prévisions" }],
    "icon": {
      "palette": { "j": "jaune", "J": "jaune-sombre", "w": "blanc", "C": "cyan-clair" },
      "pixels": ["j.j.....", ".jjj....", "jjjJjww.", ".jJwwwww", "..wwwwww", "...wwww.", "..C.C.C.", ".C.C.C.."]
    }
  }
}
```

- `category`: one of `SERVICE_CATEGORIES` (the Services page sorts and searches by it).
- `tabs`: the tabs of its screen, in their order, at most `MAX_TABS` (8): `[{ "id": "ballots", "label": "scrutins" }]`, ids lowercase letters, digits and hyphens, labels French and lowercase. Marianne draws the bar under the 3615 header, fixed while the content scrolls, and gives each tab its function key: F2 for the first, then F3… (`tabKey(i)`; F1 is GUIDE). None, or one, and the screen has no bar.
- `connections`: Marianne's connections the service relies on (`geo` for the communes); it is unavailable while one is off.
- `hosts`: every host the service reaches, from any side. The main side's network, the sync job's downloads and the window's content policy only allow these.
- `links`: URL prefixes the service opens itself; a link in an answer that starts with one opens the service with `params.url`.
- `domains`: the domains it is useful for (`DOMAIN_IDS`: identity, family, health, taxes, work, retirement, housing, mobility, justice, business). Their dashboards show its line, and its deadlines must belong to one of them.
- `permissions`: what of the user's profile it asks to read, among `PROFILE_FIELDS` (`vehicles.plate`, `vehicles.model`…, `opinions.leaning`, `opinions.themes`), and what for, in one French line: `{ "profile": ["vehicles.plate"], "purpose": "retrouver vos passages en flux libre" }`. The first time the user opens the service, Marianne asks them, field by field; they can take it back in the settings. Nothing else of the profile is ever available to a service.
- `tools`: the tools its main side lends the engines, by `name` and French `label`, as `defineTool` gives them. « Avant d’ajouter » lists them before the user adds the service; a community service may lend no other (the host refuses a tool it didn't declare). The tests check that the declaration and the runtime agree.
- `icon`: its icon, a picture in the Marianne palette (below), exactly 8 × 8. Without one, Marianne draws a neutral frame.

### The palette and the pictures

A service's icon and its tile's picture are **grids of named colours, never image files**: nothing to decode or check, one look for every service, and they follow the theme (« Minitel 1 » turns them into greys).

- **The Marianne palette**, `PALETTE` (`@marianne/sdk`): six Videotex hues, `bleu rouge magenta vert cyan jaune`, each at four levels (`<hue>-sombre`, `<hue>`, `<hue>-clair`, `<hue>-pale`), the greys `gris-sombre gris gris-clair blanc`, and `noir`: 29 colours. Marianne's stylesheet defines each from its tokens as `--palette-<name>`, which a service's own styles may use too.
- **A picture**, `PixelArt`: `palette` maps one character to a colour's name, `pixels` lists the rows, `.` transparent. Every row has the same length, at most 8 colours, every key used, at least one pixel. `pictureProblems(art, size)` says what is wrong; `readManifest` refuses an icon that isn't right, and Marianne leaves out a tile's picture that isn't.
- **The icon is 8 × 8, exactly.** Every icon is then drawn with pixels of the same size, in a row, a tile, a card or a dialog: a service's icon is never finer or coarser than its neighbours'. Draw inside the grid; leave `.` around a shape that doesn't fill it.
- **A tile's picture** is up to 24 × 8 (3615 PARLEMENT draws its hemicycle with it).
- `Pixels` and `ServiceIcon` (`@marianne/sdk/view`) draw them, in whole screen pixels so that no column comes out wider than another at 125 %: a service's own screen may draw its mosaics with `Pixels` too.
- **A data's own colours** (a political group's, a transport line's) go into the palette with `nearestPaletteColor('#1d3a8a')`: the nearest hue first, then its level, so that a dark navy stays blue; a colour without hue takes a light grey. `PALETTE_REFERENCE` gives each colour as the default theme draws it, `colorDistance` how far two are to the eye.

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
- `tile()`: its tile on the Services page, once the user pins it (below), or null for the default tile.

### The tile

When the user pins a service, the Services page shows it as a **tile**: one size for every service (a quarter of the page, 220 pixels tall), laid out by Marianne. The head is Marianne's (the icon, the code and the name, the grip that moves it), and so is the foot (« communauté » for a community service, how fresh the tile is, its button). The body is what `tile()` returns: **data, never HTML or CSS**, as `summary()` is.

```ts
export const service = defineService<MeteoMethods>({
  tile: { everyMinutes: 30 },
  activate(ctx) {
    return {
      methods: { … },
      async tile() {
        const home = ctx.home()
        if (!home) return { title: 'votre commune ?', lines: [{ text: 'votre adresse, dans Réglages › Identité', tone: 'dim' }] }
        const f = await forecastOf(ctx, home.code)
        return {
          value: { text: `${f.now}°`, unit: `${home.name} · averses à 16 h` },
          visual: { kind: 'bars', bars: f.days.map((d) => ({ value: d.max, label: d.day, text: `${d.max}°`, color: d.rain ? 'cyan' : 'jaune' })) },
          lines: [{ text: 'vent 25 km/h, rafales 50', tone: 'dim' }],
          params: { commune: home.code }
        }
      }
    }
  }
})
```

- **`ServiceTile`**: a figure (`value`: its text, at most 6 characters, and what it is, `unit`) or a `title`; one `visual`; at most two `lines`, each with a `tone` (`normal`, `dim`, `accent`, `ok`, `bad`, `live`: something happening now, with a blinking red dot); `urgency: 'urgent'` frames the tile in yellow; one `action` (a button, its `label` at most 16 characters, and the `params` it opens the service with); `params`: what a click on the tile opens.
- **The four pictures** (`TileVisual`): `bars` (up to 7, each a value, a short label, the value as read, a colour; drawn between `range`, by default from 0 to the highest), `blocks` (up to 16 squares in a row, a colour or `null` for an empty one, and a label), `gauge` (from 0 to 1, a line under it), `pixels` (a picture of the palette, up to 24 × 8). Colours are the palette's names only.
- **Marianne holds it to its limits** (`TILE_LIMITS`): a text too long is cut with « … », extra lines, bars and blocks are dropped, a part that isn't right is left out, and the log says why (`readTile`). A tile never grows. In its tests, a service checks its tiles with `checkTile` (`@marianne/sdk/testing`), which throws with the list of what Marianne would change.
- **When**: Marianne asks for the tile while the Services page shows it, when the last one is older than `tile.everyMinutes` (15 by default, 5 at least), one call at a time; she keeps the last tile in the archive and shows it at once, with its age, until a newer one comes. A tile that takes more than 10 seconds or fails leaves the last one, and is asked again 2 minutes later, then twice as late each time, never later than its period. `tile()` reads what the service keeps and may reach its declared hosts; it is asked again when the user's address, vehicles or opinions change, when its access to the profile does, and when it stores something for the user (a trip recorded on its screen).
- Without `tile()`, or while it returns null, the tile shows the service's description.
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

In the main registry, `starter` says whether it is among a new account's services. Each account is offered each built-in service once (`services.offered` in its settings): a starter joins its services (`services.added`), another waits in « découvrir » until the user adds it. A newer Marianne's new service thus shows in « découvrir » for everyone, never added behind the user's back. A service the user removes (Réglages › Services) goes back to « découvrir », unpinned, its access to the profile taken back; what it stored for the user stays.

## The Services page

The 3615 kiosk: its head is the page's one search (the 3615 bar: a code or words), and under it two tabs.

- **« mes services »**: the pinned services as tiles, in the user's order (`services.pinned`; moved by their grip, or its arrow keys; chosen in « modifier les épingles »), then all the user's services as a table: origin, theme, what each reaches and reads, when it was last opened, on or off.
- **« découvrir »**: what Marianne recommends, as cards (the built-in services not added, then the community services she recommends, validated only), then the community catalogue as a table, loaded as one scrolls, and « ajouter un fichier .3615 ».
- **The search** looks in both, ranked by trust (pinned, installed, official to add, catalogue validated, then not validated), then by relevance: the code first, then the name, a keyword of the manifest, the description, the theme, the author. A code typed in full is what ENVOI opens.
- **Adding** always goes through « avant d’ajouter »: the verdict (official, validated, not validated, outside the catalogue), what the service will be able to do (its hosts, the commune of the address, public data kept, its tools, what it asks of the profile), and what it never can.

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
