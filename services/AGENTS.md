# Building a 3615 service

A guide for whoever builds a service: a person or an agent. The contract (the manifest, the main side, the sync job, what a service may not do) is in [docs/services.md](../docs/services.md); this file is how to build one well. Marianne decides the frame of every service, so they all look and work the same. Inside it, compose your screen freely from the SDK's blocks: these are best practices, not rules the build enforces.

## What Marianne owns

The same for every service, decided by the package and its manifest rather than by code:

- **The package**: `services/<code>/`, named `@marianne/service-<code>`, with `src/main.ts`, `src/view.tsx`, `src/help.md`, optionally `src/sync.ts`, and `test/`.
- **The manifest** (the `marianne` field of `package.json`): code, name, description, category, hosts, the **tabs** of the screen, the **tools** it lends the engines, its **icon**. `readManifest` checks it; a wrong one leaves the service out.
- **The tile** on the Services page: its head (your icon, code and name) and its foot; you give its body as data (`tile()`).
- **The frame**: the 3615 header (the way back, the name, the star), the **tab bar** drawn from `tabs` (each tab with its key, F2 to F9, fixed while the content scrolls under it; none for a screen of one page), the margins, the scroll bar, and the centred column (`--content-width`).
- **The guide** (F1 on the screen): its header, the keys, the service's facts (version, author, the sites it reaches), and your `help.md` in the middle.

So a view never draws a header, a tab bar, a way back to the Services, nor a scrolling container of its own for the page.

## What you compose

What a tab shows is yours, from `@marianne/sdk/view` and Marianne's classes:

| for                                              | use                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| what a page, a tab or a pane waits for           | `<Loading label="les prévisions de Bordeaux" />`: a box in the middle, one per page      |
| a share of something done (a download, a sync)   | `<Meter share={0.4} />`: the cells of every wait, lit to the share                       |
| a part of a page already shown that waits        | `<Loading inline label="…" />`, or `<Spinner />` in a line (a search list, a button)     |
| a pane opened over a tab                         | `<LoadingGate>…</LoadingGate>`: shown whole, as a tab is                                 |
| a side panel that stays in view                  | `<StickyPanel at={id}>`: no scroll bar; taller than the window, it follows the page      |
| what couldn't come                               | `<Failure title="Prévisions indisponibles" error={…} retry={…} />` (`inline` for a part) |
| something to do first (an address, a permission) | `<Notice action={{ label: 'renseigner mon adresse', onClick }}>…</Notice>`               |
| a form                                           | `<Field label hint error>`, Marianne's inputs and `.btn`                                 |
| a dialog                                         | `<Modal>` (over the window, échap closes it)                                             |
| a filter all tabs follow                         | `<ServiceTools>`: at the tab bar's end; one or two small groups                          |
| a count beside a tab                             | `useTabBadges({ members: '3' })`                                                         |
| the tab shown, another one                       | `useTab(onPick)`: `{ tab, tabs, open(id) }`                                              |
| the main side, stored data, the app              | `useCall`, `useStored`, `useHost` (`ask`, `openRoute`, `openUrl`, `copy`, `toast`)       |
| typing and time                                  | `useDebounced(value)`, `useNow(everyMs)`                                                 |
| a mosaic in the palette, an icon                 | `<Pixels art={{ palette, pixels }} cell={4} />`, `<ServiceIcon icon={…} />`              |

Marianne's classes, styled by her stylesheet: `.card`, `.grid`, `.rows` and `.row`, `.btn` (`small`, `primary`, `danger`), `.chip` (`on`), `.link`, `.label` (a section's heading), `.box-note`, `.dim`, `.small`, `.hi`, `.bad`, `.inv` (an inverse block: a code).

## States, the same everywhere

- **Waiting**: a tab shows whole. Marianne holds it back, one `Loading` box in its place, until all it loads as it opens has come: every `useCall`, every `useStored`, and any `Loading` in it (it then says what is coming, in the box). So load through them, and write each part as if it were alone: `Loading` where it waits for itself, `inline` for a part of a page. A pane over a tab does the same with `LoadingGate`. It gives up after 10 seconds, what still waits showing in place, so a site that doesn't answer doesn't hold the page. A wait that says how far it is (`progress`, a first download) shows at once; so does what comes later (a filter, a search).
- **Failing**: `Failure`, where the content would have been, with `retry` when trying again can work.
- **Empty**: one dim sentence saying what would be there and how to get some ("Aucun trajet à payer.").
- Never a blank space: the content, a wait, a failure or an empty sentence.

## Design

- **Words**: French, labels lowercase (tabs, buttons, `.label` headings), sentences as sentences; "…" for what is coming.
- **The Minitel touches, sparingly**: the pixel font for titles, inverse blocks for codes, mosaic cells for small charts. Nothing moves but a wait.
- **Colours** from Marianne's variables only (`--fg`, `--dim`, `--hi`, `--muted`, `--accent`, `--rule`, `--bg-raised`, the eight colours `--rouge`, `--vert`…); data's own colours (a political group's) excepted.
- **Classes** prefixed with your code (`.meteo-days`); never restyle Marianne's classes for the whole window.
- **Layout** by the room the column gives you, not the window's: `@container service (max-width: 760px) { … }`. No fixed widths; a side panel stays in view with `StickyPanel`. Look at it 1440, 800 and 520 pixels wide.

## Tabs

- Declare them in the manifest, in their order: `"tabs": [{ "id": "home", "label": "accueil" }, …]`. Ids in English (`ballots`), labels in French, lowercase, a word or two (`scrutins`). At most eight. A screen of one page has none.
- The view shows what the tab holds: `const { tab } = useTab()`, then the tab's component.
- Something opened over a tab (a member's page, a ballot): keep your own stack of them, with a `← retour` at its top, and close them when the user picks a tab again: `useTab(() => setStack([]))`.
- Opened on another tab than the first: give `params.tab` (a line of "Aujourd'hui", a deadline), or `open(id)` in a layout effect when the screen decides from its params.

## Help

`src/help.md`, exported as `"./help"` in `package.json`: a few lines of Markdown, in French, under 900 characters. What the screen shows, where its data comes from, two or three things worth knowing. No heading and no keys: the guide gives the service's name, its keys and its facts around it.

## Your icon

Eight by eight pixels in the palette (`marianne.icon`), the same grid as every other service's, so that none is finer or coarser than its neighbours. A few rules make it read at 24 pixels in a table:

- One shape, recognisable from afar (a sun and a cloud, a cross, a hemicycle): no text, no letters.
- Few colours, contrasted (two to four are often enough; a hemicycle in its groups' colours needs more): a light colour (`blanc`, `<hue>-clair`) next to a strong one; avoid `noir` and `gris-sombre` alone, they vanish on the dark ground.
- The palette's names only: they follow the theme, « Minitel 1 » included. Draw it, then look at it in the tile, the table and « avant d’ajouter ».

## Your tile

What a pinned service shows on the Services page: data, laid out by Marianne (see `ServiceTile` in docs/services.md). Think of it as the answer to "what's new for me here?", read in a second.

- **One figure or one title.** A figure when there is a number worth seeing ("12°", "1", "20"), with what it is in `unit` ("trajet à payer"); a title otherwise ("Mairie de Rennes"). Six characters at most for a figure: shorten ("223 k").
- **One picture, when it says more than words**: the week's temperatures as bars, the collection days as blocks, how much of the day is left as a gauge, a hemicycle in pixels. None is better than a decorative one.
- **Two lines at most**, the most useful first; `dim` for what is secondary, `accent` for a deadline, `ok`/`bad` for a state, `live` only for what is happening now.
- **Urgent only when it is**: `urgency: 'urgent'` frames the tile in yellow; keep it for something to do today.
- **One action, if any**: the one thing the user would do from there ("payer"), with the `params` that open it.
- **Honest when it can't**: no address, nothing synced yet, nothing to pay: say it in the tile rather than return an empty one; a failure can throw (Marianne keeps the last tile).
- **Fast and frugal**: read what the service keeps, reach the network only when needed; choose `tile.everyMinutes` for how fast the figure changes (weather 30, a live sitting 5).
- Test it with `checkTile`: a tile Marianne would cut fails the test.

## Packaging a community service

A community service lives in a repository of its own and is added to Marianne as one `.3615` file; how it runs, and what it may not do, is in [docs/services.md](../docs/services.md#community-services). It is built as a built-in service is, with a few rules more: `marianne.tools` lists every tool its main side lends (by name and label, `[]` for none), each taking 1 KB of arguments at most and, until the catalogue validates the service, shown to the user on a card at each call before they reach it, its `links` are on its own declared hosts (never on a site Marianne opens herself), its name, description and labels are one short line each, it has no sync job, and it imports of Marianne only what she gives it (`@marianne/sdk`, `@marianne/sdk/main`, `zod` on its main side; React, `react-dom`, `@marianne/sdk/view` in its view). Its own dependencies are bundled with it. Its main side runs in a worker (no `document`, no `window`); its screen in a view of its own, where a link or a copy follows the user's click, Enter or Space (not a timer, a scroll or another key), no dialog opens (`print`, `alert`), and a `Modal` covers its screen only. `packages/sdk/examples/bonjour` is one to copy.

```
node packages/sdk/scripts/pack.mjs <its folder> [--out <folder>]   # or: npx marianne-pack <its folder>
```

`marianne-pack` checks the manifest as Marianne will (`readManifest`, then the tools: it activates the main side with `fakeContext` and compares them with `marianne.tools`), refuses a sync job and any import Marianne doesn't give (Node, Electron, another copy of React or zod), builds `main.js` and `view.js` (ES modules, one file each), extracts the view's styles to `view.css`, adds `help.md` and `README.md`, and writes `<code>.3615` (in `dist/` by default). Then add it from « découvrir › ajouter un fichier .3615 », and look at it as above: its screen, its tile, its tools, its guide.

## Before a pull request

- `npm run check` (formatting, boundaries, types, tests).
- The screen at 1440, 800 and 520 pixels wide, with the sidebar open and folded; each tab with its key; the guide (F1); a wait (`Loading`) and a failure (offline).
- A new service's pull request has its own template, `.github/PULL_REQUEST_TEMPLATE/new-service.md`: `gh pr create --template new-service.md`, or `&template=new-service.md` added to the address of the page that opens it.
