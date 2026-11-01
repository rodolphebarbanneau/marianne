# Working on Marianne

A guide for whoever changes this repository: a person or an agent. It says where things are, how to check a change, and the rules every change keeps; the details are in the docs it points to. In `services/`, [services/AGENTS.md](services/AGENTS.md) says how to build a service well, on top of this file.

Marianne is a desktop citizen assistant for people living in France (Electron, React, TypeScript). The user's data stays on their computer, in one encrypted archive; their own AI engine (Claude Code, Codex or Mistral Vibe) reaches it only through Marianne's tools, masked.

## Where things are

```
apps/desktop/src/main/       the main process: engines, tools, profile, content, the services' host, community services
apps/desktop/src/preload/    window.marianne, the window's only way to the main process
apps/desktop/src/renderer/   the window (React)
apps/desktop/src/shared/     what both share: the API, the settings, the types
apps/desktop/src/runtime/    the pages a community service runs in
apps/desktop/test/           the app's tests (test/renderer: the window's)
packages/                    the libraries: sdk, archive, profile, content
services/<code>/             the built-in services, the 3615 codes
docs/                        design, services, content; the user guide in docs/guide/<language>/
site/                        the website (Astro), a project of its own outside the workspace
scripts/                     the repository's checks
```

The whole map, and what may import what, is in [docs/design.md](docs/design.md#the-code).

## Commands

Node 24 and npm, from the root:

```sh
npm install                                    # installs and links the workspace packages
npm run dev                                    # the app; the window reloads live
npm run check                                  # Prettier, no stray .gitkeep, no <placeholder> outside code in Markdown, boundaries, types, tests: what CI runs
npx vitest run apps/desktop/test/news.test.ts  # one test file
npx vitest run --project content               # the content, every shipped file
npm run format                                 # Prettier on everything
```

Run `npm run check` before you push. The website has its own commands: see [site/README.md](site/README.md).

## The rules every change keeps

- **Privacy is the design.** There is no server of the project's. Identifiers reach an engine only as `[[tokens]]`, put back on the user's screen only. Anything that changes the profile, fills a form, signs, pays or sends goes through the user's approval: on a card, or given ahead and shown in the conversation as it is used. Ahead means by their level or a standing permission (going online, forms on a site, deadlines; revocable in Réglages › Autorisations), or for one turn by their click on a planned task's follow-up (its task's sites, its service's forms). Signing, paying, sending, submitting, declaring, certifying and deleting take a card every time, at every level; paying takes the payment card. An identifier she types into a page asks as a form does. On a site one of Marianne's own services that is on declares, she clicks the steps on the way without a card; every click there that commits, whatever its label, still asks once the page holds a card's fields or the user's account may be open on the site (a sign-in, a hand-over, their own typing). What remains rests on the engine flagging it: a click there that would pay without the payment card when none of this shows (a one-click payment). A change that weakens one of these is not merged.
- **Community services are untrusted code.** Their sandboxes, their screens' sessions and content policies, the `marianne-service:` scheme and the guarded network (`apps/desktop/src/main/community/`, `apps/desktop/src/runtime/`) keep each one to what « avant d’ajouter » says it can do. A change there says in its pull request what it opens and why the service stays contained ([docs/services.md](docs/services.md#what-runs-where-and-why)).
- **No personal data in the repository**: not in the code, the tests, their fixtures, a screenshot, a commit or a pull request. Tests use invented names, addresses and numbers.
- **English for code, French for the interface.** Identifiers, comments, commits, tool names and anything an engine reads are in English; everything the user reads is in French (labels lowercase, sentences as sentences).
- **Prettier formats** (`npm run format`): no semicolons, single quotes, lines up to 160 characters, LF. **Comments say why**, in full sentences, at the density of the code around them.
- **Tests come with the change**: vitest, in the package's `test/`. Test the pure parts without the network; a service's main side through `fakeContext` (`@marianne/sdk/testing`).
- **Packages keep their boundaries**: a package imports another by its name, never by a path; only `apps/` runs on Electron; a service imports only `@marianne/sdk`. `scripts/check-boundaries.mjs` holds these rules, and a new package gets its line there.

## What moves together

Some changes live in several places at once. The checks catch most of them, not all:

- **A method of `window.marianne`**: its type in `apps/desktop/src/shared/api.ts` (`MarianneApi`), its name in one list of `apps/desktop/src/preload/index.ts` (`SEND`, `INVOKE` or `LISTEN`: the type check fails without it), its handler in `apps/desktop/src/main/ipc.ts`.
- **A built-in service**: its folder `services/<code>/`, its line in the `devDependencies` of `apps/desktop/package.json`, and both registries, `apps/desktop/src/main/host/registry.ts` and `apps/desktop/src/renderer/src/host/registry.ts` ([docs/services.md](docs/services.md#registration)).
- **A module community views may import**: the SDK's `exports` (`packages/sdk/package.json`), `VIEW_IMPORTS` (`packages/sdk/scripts/pack.mjs`), `RUNTIME_MODULES` (`apps/desktop/electron.vite.config.ts`), the import map of `apps/desktop/src/runtime/view.html`, and the list in [docs/services.md](docs/services.md#the-3615-file).
- **Content** (skills, démarches, the calendar, sites, news sources): an official source for each fact, `updated` bumped with every change; `verified` is the reviewer's to set, never the author's ([docs/content.md](docs/content.md#review)).
- **What the user sees**: the user guide changes with it, in every language in the same pull request, the same file names in each ([docs/guide](docs/guide/README.md)); `README.md` and `docs/` too when they describe it.

## Commits and pull requests

- Branch from `main`, one subject per pull request.
- Pull requests are merged by rebase, so `main` stays a straight line of commits. Rebase your branch on `main` rather than merging `main` into it: a merge commit can keep a pull request from being rebased.
- Commit messages are short, plain sentences ("Give the profile's archive tests 30 seconds"), with the details in the body when they help.
- Open the pull request with the template that fits: [the default one](.github/pull_request_template.md) for code, or one of [`.github/PULL_REQUEST_TEMPLATE/`](.github/PULL_REQUEST_TEMPLATE) for a service, new or changed (`service.md`, with screenshots of every page it creates or changes and of its tile pinned), content (`content.md`), or the user guide and the docs (`guide.md`). From the command line: `gh pr create --template service.md`; with `--body`, write the template's sections in it.
- Screenshots never wait for a hand to drag them in: write each as `![what it shows](shot:file.png)` in the description, then run `npm run pr:shots -- <number> --from <folder>`, which uploads them to `refs/shots/pr-<number>` (not a branch, so no clone downloads them) and links them; `--again` replaces the ones already linked with the folder's new versions, `--dry` says what it would upload.
- CI must pass: the checks, the site, and a package build on Windows, macOS and Linux.
- The `site` branch is built from `main` at each release (`.github/workflows/site.yml`): never commit to it.
