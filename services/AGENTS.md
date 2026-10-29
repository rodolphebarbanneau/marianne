# Building a 3615 service

A guide for whoever builds a service: a person or an agent. The contract (the manifest, the main side, the sync job, what a service may not do) is in [docs/services.md](../docs/services.md); this file is how to build one well. Marianne decides the frame of every service, so they all look and work the same. Inside it, compose your screen freely from the SDK's blocks: these are best practices, not rules the build enforces.

## What Marianne owns

The same for every service, decided by the package and its manifest rather than by code:

- **The package**: `services/<code>/`, named `@marianne/service-<code>`, with `src/main.ts`, `src/view.tsx`, `src/help.md`, optionally `src/sync.ts`, and `test/`.
- **The manifest** (the `marianne` field of `package.json`): code, name, description, category, hosts, and the **tabs** of the screen. `readManifest` checks it; a wrong one leaves the service out.
- **The frame**: the 3615 header (the way back, the name, the star), the **tab bar** drawn from `tabs` (each tab with its key, F2 to F9, fixed while the content scrolls under it; none for a screen of one page), the margins, the scroll bar, and the centred column (`--content-width`).
- **The guide** (F1 on the screen): its header, the keys, the service's facts (version, author, the sites it reaches), and your `help.md` in the middle.

So a view never draws a header, a tab bar, a way back to the Services, nor a scrolling container of its own for the page.

## What you compose

What a tab shows is yours, from `@marianne/sdk/view` and Marianne's classes:

| for                                              | use                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| what a page, a tab or a pane waits for           | `<Loading label="les prévisions de Bordeaux" />`: a box in the middle, one per page      |
| a part of a page already shown that waits        | `<Loading inline label="…" />`, or `<Spinner />` in a line (a search list, a button)     |
| what couldn't come                               | `<Failure title="Prévisions indisponibles" error={…} retry={…} />` (`inline` for a part) |
| something to do first (an address, a permission) | `<Notice action={{ label: 'renseigner mon adresse', onClick }}>…</Notice>`               |
| a form                                           | `<Field label hint error>`, Marianne's inputs and `.btn`                                 |
| a dialog                                         | `<Modal>` (over the window, échap closes it)                                             |
| a filter all tabs follow                         | `<ServiceTools>`: at the tab bar's end; one or two small groups                          |
| a count beside a tab                             | `useTabBadges({ members: '3' })`                                                         |
| the tab shown, another one                       | `useTab(onPick)`: `{ tab, tabs, open(id) }`                                              |
| the main side, stored data, the app              | `useCall`, `useStored`, `useHost` (`ask`, `openRoute`, `openUrl`, `copy`, `toast`)       |
| typing and time                                  | `useDebounced(value)`, `useNow(everyMs)`                                                 |

Marianne's classes, styled by her stylesheet: `.card`, `.grid`, `.rows` and `.row`, `.btn` (`small`, `primary`, `danger`), `.chip` (`on`), `.link`, `.label` (a section's heading), `.box-note`, `.dim`, `.small`, `.hi`, `.bad`, `.inv` (an inverse block: a code).

## States, the same everywhere

- **Waiting**: one `Loading` box per page, tab or pane, saying what is coming. It shows after a moment, so a quick answer doesn't flash it. Wait for what the page needs together rather than stacking boxes; parts that come later wait inline.
- **Failing**: `Failure`, where the content would have been, with `retry` when trying again can work.
- **Empty**: one dim sentence saying what would be there and how to get some ("Aucun trajet à payer.").
- Never a blank space: the content, a wait, a failure or an empty sentence.

## Design

- **Words**: French, labels lowercase (tabs, buttons, `.label` headings), sentences as sentences; "…" for what is coming.
- **The Minitel touches, sparingly**: the pixel font for titles, inverse blocks for codes, mosaic cells for small charts. Nothing moves but a wait.
- **Colours** from Marianne's variables only (`--fg`, `--dim`, `--hi`, `--muted`, `--accent`, `--rule`, `--bg-raised`, the eight colours `--rouge`, `--vert`…); data's own colours (a political group's) excepted.
- **Classes** prefixed with your code (`.meteo-days`); never restyle Marianne's classes for the whole window.
- **Layout** by the room the column gives you, not the window's: `@container service (max-width: 760px) { … }`. No fixed widths; a side panel may stick (`position: sticky`) within the page. Look at it 1440, 800 and 520 pixels wide.

## Tabs

- Declare them in the manifest, in their order: `"tabs": [{ "id": "home", "label": "accueil" }, …]`. Ids in English (`ballots`), labels in French, lowercase, a word or two (`scrutins`). At most eight. A screen of one page has none.
- The view shows what the tab holds: `const { tab } = useTab()`, then the tab's component.
- Something opened over a tab (a member's page, a ballot): keep your own stack of them, with a `← retour` at its top, and close them when the user picks a tab again: `useTab(() => setStack([]))`.
- Opened on another tab than the first: give `params.tab` (a line of "Aujourd'hui", a deadline), or `open(id)` in a layout effect when the screen decides from its params.

## Help

`src/help.md`, exported as `"./help"` in `package.json`: a few lines of Markdown, in French, under 900 characters. What the screen shows, where its data comes from, two or three things worth knowing. No heading and no keys: the guide gives the service's name, its keys and its facts around it.

## Before a pull request

- `npm run check` (formatting, boundaries, types, tests).
- The screen at 1440, 800 and 520 pixels wide, with the sidebar open and folded; each tab with its key; the guide (F1); a wait (`Loading`) and a failure (offline).
