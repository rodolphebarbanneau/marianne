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
apps/desktop/src/main/community/     community services: the catalogue, .3615 files, their sandboxes (runtime/)
apps/desktop/src/runtime/            the pages a community service runs in (its main side's, its screen's)
packages/sdk/scripts/pack.mjs        marianne-pack: a community service's .3615
packages/sdk/examples/bonjour/       3615 BONJOUR: an example of a community service, to copy
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
- `news`: `true` when it reads headlines through Marianne (`ctx.news`, below) rather than from the press itself: no press host to declare. Built-in services only: a community service that declares it is refused when it is added.
- `search`: the screen's search field, drawn by Marianne in its header, `{ "placeholder": "chercher dans les titres" }` (French, one line); the view reads it with `useSearch()`.
- `links`: URL prefixes the service opens itself; a link in an answer that starts with one opens the service with `params.url`.
- `domains`: the domains it is useful for (`DOMAIN_IDS`: identity, family, health, taxes, work, retirement, housing, mobility, justice, business). Their dashboards show its line, and its deadlines and the tasks it proposes must belong to one of them.
- `permissions`: what of the user's profile it asks to read, among `PROFILE_FIELDS` (`vehicles.plate`, `vehicles.model`…, `opinions.leaning`, `opinions.themes`, `opinions.sources`), and what for, in one French line: `{ "profile": ["vehicles.plate"], "purpose": "retrouver vos passages en flux libre" }`. The first time the user opens the service, Marianne asks them, field by field; they can take it back in the settings. Nothing else of the profile is ever available to a service.
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

The user may say, in Réglages › Identité, which political groups they feel close to (`opinions.leaning`: acronyms of each chamber's groups, from the content's `parliament.json`), which themes matter to them (`opinions.themes`: ids of `THEMES`, `ecology`, `housing`…) and which news sources they read (`opinions.sources`: the sources of the content's `news-sources.json` they accept, the sections they keep, the colours they gave sources). All are optional and never inferred; the leaning and the sources are sensitive data (RGPD, article 9; what one reads says what one thinks): a service reads them only when it asked and the user accepted, and Réglages › Identité lists those services with the day each last read them. Engines never receive them.

- Use a leaning to compare, never to sort, hide or recommend: "votre députée a voté comme vos idées dans 82 % des cas", and offer the other side as well.
- Themes say nothing of an opinion: they bring matching content forward. `themesOf(text, themes)` (`@marianne/sdk`) tells which themes a text is about, by their words.
- A source's colour is its editorial line (`Lean`: five positions, `gauche` to `droite`, `centre` the middle for a source with no clear lean): it shows, and never sorts, hides or picks; accepting or setting a source aside stays the user's choice. Without `opinions.sources` granted, a service sees Marianne's defaults, never the user's.

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

| `ctx.`     | what                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `manifest` | its manifest                                                                                                  |
| `http`     | `json`, `text`, `page` (as a browser): HTTPS to its declared hosts only, Marianne's user agent                |
| `log`      | Marianne's log, prefixed with the service                                                                     |
| `storage`  | the user's data for it (favorites…), in the encrypted archive; throws while locked                            |
| `dataDir`  | a folder of this computer for its public data (its sync job fills it); never personal data                    |
| `geo`      | `findCommunes`, `getCommune`: the communes of France                                                          |
| `home()`   | the commune of the user's address, or null                                                                    |
| `profile`  | `granted()`, `vehicles()`, `leaning()`, `themes()`, `sources()`: the fields the user granted it, nothing else |
| `news`     | the headlines Marianne reads for it (below); present only with `"news": true`                                 |
| `sync`     | `status()` and `run()` of its sync job                                                                        |

`activate` returns the runtime:

- `methods`: what its view calls. Declare them as a `type` (an `interface` lacks the index signature `ServiceMethods` needs) in the package (`{ forecast(code: string): Forecast }`) and pass it to `defineService`: the view's calls are checked against it. Arguments and results cross processes: plain data only.
- `tools`: tools the engines may call while the service is on. Engines see them as `<code>_<name>` (`parlement_ballots`). `label` is French, as the conversation shows the call; `description` and results are English, for the model. Arguments never carry the user's identifiers: the host refuses `[[tokens]]` in them. Throw `ToolError` for a failure the model should read (nothing found, a missing argument).
- `skills`: guides the engines read when a request calls for them, Markdown with a front matter (`name`, `title`, `description`); import them as text (`import guide from './skills/x.md?raw'`).
- `instructions`: a few lines (English) added to the engines' instructions while the service is on.
- `today(day)`: its lines of "Aujourd'hui" for a day (`TodayItem`), each opening the service with its `params`. No screen shows them since the Actualités page left the frame; the day's agenda (3615 CALENDRIER) will.
- `summary(domain)`: its line on the dashboard of one of its domains (`ServiceSummary`: a French sentence, an urgency, the `params` to open it with), or null. It is data: Marianne lays out every service's line the same way.
- `deadlines()`: the deadlines it knows of (`ServiceDeadline`), from what it keeps in `ctx.storage`; they join the user's deadlines and reminders. Called often: no network.
- `tasks()`: the planned tasks it proposes (`ServiceTaskTemplate`, below), from what it keeps. Read when the Démarches pages show: no network. Built-in services only for now.
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

### Planned tasks

A service may propose a **planned task**: something Marianne checks for the user on a rhythm, in a folder that comes back ([design.md](design.md#planned-tasks)). `tasks()` returns its proposals as **data**, as `summary()` and `deadlines()` do: a service proposes and never schedules. Marianne lays each one out on the sheet the user reads, and nothing runs without their yes.

```ts
export const service = defineService<PeageMethods>({
  activate(ctx) {
    return {
      // One per vehicle whose plate the service was given: without it, there is nothing to look for.
      tasks: () => tollTasks(vehicles().list)
    }
  }
})
```

A `ServiceTaskTemplate` says:

- `id`: stable within the service, for one thing it covers (`tolls:<vehicle id>`). The user's task remembers it, and what they have taken is no longer proposed.
- `domain`: one of the manifest's `domains`; a template outside them is left out.
- `title`, `checks`, `detail`: French, what it is called, what it checks, and where.
- `entity`: what it is about, its `id` and the `label` the user knows it by (a plate).
- `rhythms`: what the user chooses from (`every`, a French `label`, a `note` on what this rhythm means here, `warn` when it is too spaced for what the task is for), the usual one at `rhythm`.
- `allows`, `never`: French, what Marianne may do at each run, and what she will never do.
- `instruction`: English, what Marianne is asked at each run. A run looks and reports, and the tools hold it to that: it shows no card, opens only `sites`, clicks only what searches or moves through a page, types only the entity's identifier, and has only your service's tools besides the app's reading ones. Anything else is refused and it reports "waiting". Ask it to look, and leave paying, signing and sending to the user.
- `sites`: the hosts she may open at each run without asking again, for this task only.

**Built-in services only for now.** A task's instruction feeds the engine and its sites are reached without asking, so it is content that can inject: the host doesn't read a community service's `tasks()`.

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

### News

A service that declares `"news": true` reads the press through `ctx.news`: Marianne reads the whole catalogue (`news-sources.json`, sections included), keeps 7 days of titles, groups them into subjects (`groupSubjects`) and hands them over; the service reaches no press site. With `opinions.sources` granted, it gets the user's accepted sources and sections, and their colours; without it, every source of Marianne's list, unmarked, in Marianne's colours: say so on the screen.

| `ctx.news.`                               | what                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `filtered()`                              | the user's sources apply (`opinions.sources` granted); false: all of Marianne's                                               |
| `read({ day?, all? })`                    | a `NewsReading`: every title of the last 24 hours (or of a day of the 7, `YYYY-MM-DD`), the subjects, the sources that failed |
| `search(words, { since?, limit?, all? })` | the titles matching words over the 7 days, most recent first                                                                  |
| `article(id)`                             | a `NewsArticle` for one title on screen: its media and the start of its article; null when there is nothing to read           |
| `sources({ all? })`                       | `NewsSourceInfo[]`: the catalogue, to name and colour sources (the user's colours when granted, else Marianne's)              |

- `all`: the sources the user set aside too, marked `setAside`, for « toutes »; only for a service that may read `opinions.sources` (without it, everything is there already, unmarked).
- `read()` gives the single titles with the subjects: a screen arranges the same titles by subject, by time or by source. A subject's id is its first title's, kept as it grows.
- `article(id)` reads one page when asked, without cookies, and keeps it with the title: the start is 600 characters at most, cut at a sentence; never past a paywall (`paid`, no `start`: the page's `isAccessibleForFree`, or the source's `paywall` rule), never for a source that said `"start": false`. Ask only for the title the screen shows.
- Everything comes from a feed: Marianne writes no news, and neither does a service (a subject is named by the words its titles share, `subjectWords`).
- `@marianne/sdk/news` holds the pure helpers both sides share: `titleWords`, `similarity`, `stem`, `subjectWords`, `ownWords`, `isLive`, `withoutLive`, `groupSubjects`, `sideOf`, `LEANS` and `LEAN_LABELS`.

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

- `useHost()`: the manifest, `call(method, …args)`, `params` (what it was opened with), `home`, `ask(text, page?)` (hand a question to Marianne: a new folder, the question in the composer), `openRoute(route, params?)` (another screen: `settings/identity`, `service/carte`; with what it opens with, `openRoute('service/infos', { search: 'budget 2027' })`; a settings page's section, `settings/identity#sources`), `openUrl`, `copy`, `toast`, `load(key)`/`save(key, value)` (the same storage as `ctx.storage`).
- `useCall(method, args)`: a method's result, loaded again when the arguments change (the previous result is dropped meanwhile); `null` arguments wait. Loaded again with the same arguments (`reload()`, or Marianne giving the screen a new host when what it may read changes), it keeps the previous result until the new one comes: a player or a list stays on screen.
- `useStored(key, defaults)`: stored data with defaults, and a function that merges, shows and stores.
- `useTab(onPick?)`: `{ tab, tabs, open(id) }`, the tab shown (`''` without tabs) and a way to show another; `onPick` runs whenever the user picks a tab, the one shown included (a screen with panes over its tabs closes them). Marianne scrolls back to the top on a new tab. The screen opens on the tab its `params.tab` names, else the first.
- `useTabBadges({ members: '3' })`: a short count beside tabs. `<ServiceTools>`: a few controls of the whole screen at the end of the tab bar (of the header, without tabs).
- `useSearch()`: `{ query, set(text), clear() }`, what is typed in the header's search field (a manifest with `search`), trimmed and debounced, `''` when empty. Marianne draws the field once the screen shows (not before the consent); « / » reaches it and Échap in it clears it; the query stays across tabs and goes when the user leaves the service; opened with `params.search`, the field is filled. The view decides what it filters, tab by tab.
- `useKeys(keys)`: the screen's own keys in the bottom bar, after Marianne's, as `ServiceKey`s (`{ key: 'ENVOI', what: 'ouvrir le sujet 1', shortcut: 'Entrée' }`). The bar only shows them: the view still listens to the keyboard itself.
- `Loading` (`label`, `progress` from 0 to 1, `detail`; `inline` for a part of a page), `Failure` (`title`, `error`, `retry`; `inline`), `Notice` (a note with its `action`): the states of a page, the same in every service (see [services/AGENTS.md](../services/AGENTS.md)). `useDebounced(value, ms)`, `useNow(everyMs)`.
- `Spinner`, `Field`, `Modal`: the window's blocks (a `Modal` opens over the whole window, out of the screen's layout). Marianne's stylesheet styles them and the usual classes (`.card`, `.grid`, `.btn`, `.rows`, `.dim`…); a service's own styles go in a CSS file its view imports, with class names prefixed by its code (`.meteo-days`).

### Media

`@marianne/sdk/media` is Marianne's video player: an HLS stream (hls.js; a recording or a broadcast) with the controls over the picture. Its styles come with it (the module puts them in the page); it is a module of its own so that a view without video doesn't load hls.js.

```tsx
import { Player, type PlayerHandle } from '@marianne/sdk/media'

;<Player
  ref={player}
  src={video.hls}
  poster={video.poster}
  start={params.t}
  chapters={chapters} // { at, title, speaker?, depth }, ms from the start, in the agenda's order
  gaps={suspensions}
  clockStart={video.openedAt}
  title={video.title}
  badge="AN"
  shareUrl={(at, clip) => portalUrl(video, at ?? clip?.from)}
  onKeepClip={(clip) => keep(clip)}
  onChapter={(c) => showInAgenda(c)}
  pin={{ title: video.title, badge: 'AN', route: 'service/parlement', params: { video: video.id } }}
/>
```

- **The bar**: play, ∓10 s, the volume, the time, DIRECT for a broadcast, what is said now (the deepest chapter's subject; `onChapter` on a click), then the options, the mini-player and fullscreen. The controls fade after 3 s without a move while it plays. A double click on a side of the picture is ∓10 s, in the middle fullscreen. Under 620px of width the volume and the mini-player go into the options; under 680px the subject goes.
- **The track**: the agenda's top lines cut it, `gaps` are dark, `kept` clips a yellow line above it; hovered, the moment, its subject and its speaker. A broadcast's spans the sitting up to the live edge (live is taken from the playlist, `live` is a hint).
- **The options**: the quality (hls.js's levels, or automatic), the speed (0.5 to 2×, back to normal for each video), the time read as the video's or, with `clockStart`, as the room's clock (Paris time), « garder un extrait » (with `onKeepClip`: the track becomes a magnifier around the clip, its strip under the picture; `snapClip` and `clipTitle` change what the chapters suggest), « partager le lien » (with `shareUrl`; `shareText` for « copier avec le titre »), picture-in-picture.
- **The keyboard**, when the player has the focus, or nothing on the page has it: Space/K, ←/→ and J/L, ↑/↓, M, F, P, < >, 0–9, X, I/O while cutting, End for the live edge. A key it takes is `preventDefault`ed: a page's own shortcuts skip keys whose event says so.
- **The mini-player**: with `pin` and a host that has one (`host.media`), the bar's key (P) hands the video to the app, which keeps playing it in a corner of the window, over any page; so does leaving the page while it plays. `pin.route` and `pin.params` bring the user back to it, with `t` (ms) to resume from. `MiniPlayer` is the app's side.
- **`host.media`**: `pin(item, { auto })` hands a video to the app (`auto`: from a page that leaves; the app waits 300 ms before showing it), `take(src)` hands it back: when the mini-player shows that video, or is about to, the app closes it and answers where it was (ms), null otherwise. A `Player` takes it as it mounts and starts there, so a page that comes back by any way never plays a video twice. The mini-player's ⤢ and its caption close it and open `pin.route` with `pin.params` and `t`; its × stops it (what the service saved of the position is all that is kept), and so does removing or turning off the service its `pin.route` leads to. It snaps to a corner of the window when dragged (the corner is remembered), its bottom corners above a folder's reply box.
- **A community service's videos**: its screen plays them from its declared hosts only: its content policy lets it connect and play from its own address, `blob:` and those hosts, and its session hands each request to the main process, which fetches it as it fetches its pictures (`marianne-service://<code>/~media/<host>/<path>`, a video's or a playlist's types only, within 10 MB, in its line of requests; a byte range passed on, asked for uncompressed). So its videos should be HLS or DASH in small pieces, each within 10 MB: a plain MP4 over 10 MB doesn't play, since a `<video>` asks for the rest of the file from where it reads, and the answer stops at 10 MB. Its `host.media` crosses the bridge: `pin` is a message the main process checks (a declared host, `route` its own screen; the user's hand: a click, Enter or Space in the screen within the 5 seconds before, or P within the second; `auto` only as the screen goes, so a player that unmounts while its screen stays doesn't pin), `take` answers at once from what the window last said of the mini-player (it says where it is every 2 s, and when the screen opens), then tells the window. A screen hears of the mini-player's video, and takes it back, only when it pinned it: what the user watches from another service never reaches it. The window plays from the built-in services' hosts only (its own content policy): a community service whose hosts are not among them has no mini-player key. The screen, drawn over the window, stops short of the mini-player; leaving it, its view is unmounted a moment before it closes, so that a video playing pins itself.
- `PlayerHandle` (`ref`): `seek(ms, play?)`, `time()`, `play()`, `pause()`, `toLive()`. The player remembers the time's mode, the volume and the sound cut in the window's storage (`marianne.media`).
- `.mp-badge[data-badge='…']` colours a badge (cyan by default).

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

Each package has its own `test/` and `vitest.config.ts`; `npm test` at the root runs the app's tests and every package's (vitest projects). Test the pure parts (parsers, queries, formatting) without the network; the main side through `fakeContext` from `@marianne/sdk/testing`, built from the service's package.json (`fakeContext(pkg, { answer, communes, profile, news })`: the network's answers, which it records, a storage in memory, the communes, the profile fields given (`profile.sources` among them) and, for `"news": true`, what `ctx.news` reads: `{ read, sources, articles }`); a sync job's logic through `execute` from `@marianne/sdk/sync`, with a fake `download`. `npm run typecheck` checks the app and each package (`tsc -p services/<code>`).

## Community services

A community service is the same package as a built-in one (the manifest, `main`, `view`, `help.md`, the same SDK), published by someone else: Marianne didn't build it and doesn't trust its code. It arrives as a file and runs apart from everything else, so that it can do no more than « avant d’ajouter » says.

### The .3615 file

A `.3615` is a zip of the built service, its files at its root: `package.json` (the manifest), `main.js` and `view.js` (ES modules), and if it has them `view.css`, `help.md`, `README.md`. Nothing else: no folder, no other file, at most 5 MB. `marianne-pack` makes it from the service's package (see [services/AGENTS.md](../services/AGENTS.md#packaging-a-community-service)); the same sources give the same file, byte for byte.

- `main.js` imports only `@marianne/sdk`, `@marianne/sdk/main` and `zod`; `view.js` only `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@marianne/sdk`, `@marianne/sdk/view`, `@marianne/sdk/media` (and the main side's two). Marianne gives her own copies: one React, one SDK, one zod.
- `marianne.tools` lists every tool the main side lends, by name and label: « avant d’ajouter » shows them, and a service whose code lends another, or under another label, doesn't start. Its code may not be the start of one of Marianne's tools' names (3615 READ would name its tools as `read_page` is).
- `marianne.links` are pages on its own declared hosts, never on a host a built-in service reaches or opens nor on a public site Marianne opens herself (the sites of the content, the public sources); « avant d’ajouter » shows them. A link of Marianne's (an answer, a guide) that a community service claims doesn't open in it straight away: the user chooses, « ouvrir dans 3615 X » or « ouvrir dans votre navigateur ».
- Its words are short and on one line each: its name at most 60 characters, its description 200, a tab's or a tool's label 48, a keyword 40 (`readManifest`): they go to lists, and to the engines.
- Reading a file runs nothing of it: the zip is checked before anything is inflated, then the manifest is read as data (`apps/desktop/src/main/community/package.ts`). The SHA-256 of each file is kept, and checked again before it runs.

### The catalogue and validation

The community catalogue is one index the project signs (`main/community/catalogue.ts`). It lists each version of a service by the SHA-256 of its file: **validated** when this exact file was reviewed and the project signed it, **unvalidated** when it is published, its author known, not reviewed. A file it doesn't list is **outside the catalogue** (one's own service, a test): it may be added, after a warning. The project may **withdraw** a validation: Marianne then switches the service off, saying why, until a newer version comes. The index says until when it may be used (`expires`): past it, its validations no longer count (its withdrawals still do), and an index older than the latest one taken is never taken again. A file downloaded from the catalogue must say what its entry says (name, hosts, connections, profile fields, tools, links). The Services page shows each community service's standing (`ServiceState.trust`).

A service is added on this computer, for every account that has it. Each account keeps the file it reviewed (`services.reviewed`): when another account replaces it with a newer version, it stays off for this one until this one reviews the new version.

### What runs where, and why

- **Its main side** runs in a worker of a hidden, sandboxed page of its own (`main/community/runtime`): no document, no Node, no Electron, no `window.marianne`; a session of its own that keeps nothing, cancels every request but its own files and sends what it can't cancel (WebRTC, name resolution) to a proxy that leads nowhere; every permission refused. The page holds the bridge (`window.__marianneService`) and relays: the service's context is a request for each part, the network and the communes answered later, the storage, the commune and the profile fields granted at once (the worker waits on memory it shares with its page). The main process answers each with the context a built-in service gets for that manifest, narrowed: HTTPS to its declared hosts only, each redirect checked again and never to an address of this computer or its network, at most 6 requests at a time (its pictures included) and 24 waiting, each done within 60 s, its answers inflated as they come within their limit (10 MB) and its cache kept within 16 MB; its own records of the archive, within a quota (1 000 records, 16 MB); the commune of the address with its centre, never the address's own place; the fields the user granted. Only that sandbox's main frame may use the bridge, and only so often: its page counts and measures each call before it crosses (only JSON text within its length goes, and a reply is cut to its kind's size there), the main process checks both again before it reads anything.
- **Its screen** runs in a view of its own over the screen's content (`main/community/runtime/screen.ts`), locked down the same way: its own session, its own files only, its declared hosts' pictures fetched by the main process through the scheme, its page sandboxed (no dialog, no popup, no download, from it or any frame it makes: `print()` from a child frame does nothing). Its preload measures and counts what it sends before it crosses. The window draws the frame around it (`renderer/src/host/community-screen.tsx`) and hides it while something covers it (a dialog, the palette, the settings, the guide). Its view gets the same `useHost` and `useTab` as a built-in screen, each a message to the main process, which answers its calls and data itself and hands the window the rest: a question for Marianne (a page it shows is labelled as its own), another screen, a tab to show, a toast (« 3615 X · … », drawn by the window over its bottom bar: nothing of the window's is drawn in the screen). A link on its declared hosts or its `links`, a copy, and a video handed to the mini-player, need the user's click, Enter or Space in the screen within the 5 seconds before (a scroll or another key doesn't count; for a video, the player's P too); the link opens once the user agrees, nothing focused for an Enter. Its keys come from its input, not its page: F1 to F9 go to the window, échap when the screen doesn't use it, the user's shortcut to lock the account locks it; only the user's keys, clicks and scrolls there keep the account awake. A reload of the window, a navigation or a crash of its page closes the screen (the page opens it again). No name is looked up as a hint, in any page of the app (`blink-settings` in `main/index.ts`): a `<link rel="dns-prefetch">` goes to the system's resolver whatever a session's proxy says, and a name can carry a message to the DNS servers of its author. Measured with Chromium's net log, in the packaged app too: it no longer happens; STUN and TURN servers given by name, from a frame the screen makes, are not looked up, and a TURN server over TCP given by its address is not connected to (no candidate either).
- **The host** sees it as a built-in service: its methods, tools (their arguments as JSON Schema, rebuilt from a short list of keywords and checked before they cross), tile, summaries, lines of "Aujourd'hui" and deadlines (kept, read again every minute and after it stores something) reach it through its sandbox, with a time limit each (a method 30 s, a tool 60 s, a tile, a summary or a day's lines 10 s) and a size (a tool's result 256 KB, a tile 64 KB). Its tools never learn the folder they are called from. What a tool is sent stops at `CommunityService` until it passes: its schema, 1 KB at most as JSON (`MAX_TOOL_ARGUMENTS_BYTES`), and, unless the catalogue validates the service, the user's yes on a card showing it argument by argument (`main/community/runtime/consent.ts`), at each call. No answer, or no conversation to show the card in, is a no; a call with no arguments has nothing to ask. For the engines, it is « a community service »: its instructions and guides count only once the catalogue validates it (its guides named after it, never in the place of Marianne's), the description of a tool it doesn't validate is short and says so, and the engines are told to send community tools only what the request needs.
- It runs while an open account has it among its services and doesn't switch it off: it starts at the unlock (`activate` then, rather than at Marianne's start) and stops at the lock. A crash or a hang stops it; Marianne starts it again once, then leaves it off with the reason, its tools withdrawn. Removing it (Réglages › Services) also removes it from this computer.

`marianne-service:` serves its pages (`apps/desktop/src/main/community/runtime/scheme.ts`): marianne-service://<code>/ the service's `main.js` (its imports pointed at Marianne's modules), `view.js` and `view.css` (nothing else of its folder), marianne-service://<code>/~runtime/ Marianne's runtime (`apps/desktop/src/runtime`, built into `out/runtime` with the main process, listed when the app starts: the two pages, the worker, the modules of the screen's import map, the stylesheet and the fonts), and marianne-service://<code>/~picture/… its declared hosts' pictures. Only while the service is active, and each session its own code only.

### The limits of this version

- **No sync job**: it would run with Node, out of any sandbox. A file with a `sync.js` is refused; `ctx.dataDir` is `''` and `ctx.sync` does nothing.
- **No planned tasks**: a task's instruction feeds the engine and its sites are reached without asking, so the host leaves out what its `tasks()` would propose.
- **A screen of its own**: it lays out by its view's width as a built-in screen does by its column's, but it can't reach the window. `ServiceTools` are drawn at the top of its screen rather than at the end of the tab bar; a `Modal` covers its screen, not the whole window; the window's keyboard shortcuts other than F1 to F9, échap and the lock work once the focus is back on the window.
- **Plain data across**: what its methods and tools return, and what it stores, crosses processes as JSON (1 MB at most for a stored value).

### What remains open

- **Its words reach the engines.** A tool's result is the service's text, read by the model, as a built-in service's is; its arguments are what the model chose to send, within 1 KB. A service nobody reviewed gets them only once the user has read them and agreed. For a validated one, the model is told to keep them to what the request needs, but nothing can check that a model never sends more: validation, which reviews a service's code and words, stands in for that.
- **Pictures of its declared hosts** come through Marianne: their servers see a request from this computer (not who asked, nor for which page), as for any request to a declared host.
