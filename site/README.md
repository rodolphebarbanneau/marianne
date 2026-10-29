# The site

Marianne's website: one page to make people want the app and download it, and the [user guide](../docs/guide/README.md), in French (at the root) and in English (under `/en/`). An [Astro](https://astro.build) project of its own, outside the npm workspace: it has its own `package.json` and lockfile, and nothing of the app's.

```sh
cd site
npm install
npm run dev       # http://localhost:4321/marianne/
npm run check     # astro check: the types of the pages and components
npm run build     # dist/, a static site
```

## What it shows

- **The home page** (`src/components/Home.astro`): the hero and its download button, real screens of the app, what it does, privacy (the `[[tokens]]`), the engines, the 3615 services, the downloads for each system, and the guide's contents. Its words are in `src/i18n.ts`, in French and in English.
- **The guide**: the Markdown of `docs/guide/<lang>/` itself, as a content collection (`src/content.config.ts`). The pages come in the order `index.md` lists them, their links to each other (`install.md`) become the site's (`src/lib/guide-links.mjs`), and every page links its source on GitHub. A change to the guide is a change to the site: there is nothing to copy.
- **The look**: the app's (`apps/desktop/src/renderer/src/styles.css`): its colours, its two fonts, the dot matrix, inverse video, the function keys; the old screen's lines and glow, always on here and lighter than the app's; the "Minitel 1" option. The palette is copied in `src/styles/global.css`: keep the two in step. Behind the hero, Delacroix's _La Liberté guidant le peuple_ (1830, public domain) as a Minitel mosaic (`src/assets/liberte.png`): the top of the painting from its Wikimedia Commons reproduction, in 160 columns of 9-pixel blocks, five levels of the site's blue with ordered dithering, the darkest left transparent. The icons in `public/` are the app's, written by its generator (`apps/desktop/scripts/generate-icons.mjs`): in the tab, the tray's tile, drawn for each size; on an iPhone's home screen, the app's.

## Downloads

The buttons link the installers of the latest release on GitHub, prereleases included (GitHub's "latest" skips them, and Marianne's are alphas): read when the site is built, and again in the visitor's browser, at most once per visit, so a release published since gets its buttons without a rebuild. Without GitHub, they link the releases page. The installers are found by their names (`src/lib/release.ts`, after `apps/desktop/electron-builder.yml`): a change to `artifactName` goes there too.

The page guesses the visitor's system: Windows, Mac (Apple silicon, or Intel when the browser tells, which only Chromium does), Linux (the `.deb` first); phones are told Marianne is for a computer.

## The screens

`src/assets/screens/` holds captures of the real app at 1440×900, twice the pixels, on a test account with made-up data (never real personal data: see [CONTRIBUTING.md](../CONTRIBUTING.md)). Astro makes the smaller sizes at build time. To replace one, capture the app's window at the same size and keep the file's name.

## Publishing

`SITE_URL` and `BASE_PATH` say where the site lives; by default, GitHub Pages: `https://rodolphebarbanneau.github.io/marianne/`. On a domain of its own: `SITE_URL=https://marianne.example BASE_PATH=/ npm run build`. The build is a folder of static files (`dist/`), for any host.

The `Site` workflow (`.github/workflows/site.yml`) builds it into the `site` branch, which GitHub Pages serves: when a release is published, so the download buttons and the guide are the release's, or by hand (Actions → Site → Run workflow), from any branch or tag. The branch holds the build alone, in one commit replaced each time. The workflow asks Pages where the site lives, a domain of its own included, and builds for that address, with the `CNAME` file that keeps the domain: Pages reads it from the branch.

To set it up, once: run the workflow, then in Settings → Pages, deploy from the `site` branch, at its root. For a domain of its own, enter it there, then run the workflow again so the site is built for it.

The branch and the folder share a name: where git can't tell them apart, `git log site --` is the branch, `git log -- site` the folder.
