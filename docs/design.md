# Marianne: design

Marianne is a desktop citizen assistant for people living in France: their rights, their formalities, their papers and deadlines, and public information. The user works with Marianne in conversations; Marianne works through the user's own AI engine (Claude Code, Codex or Mistral Vibe), which only reaches the user's data through Marianne, masked.

## Principles

- **Local and private.** Personal information never goes to a server of ours: there is none. Each account is one encrypted archive on the user's computer.
- **Masked for the engines.** Identifiers (social security number, tax number, names, address, IBAN…) are replaced by `[[tokens]]` before anything reaches an engine, and put back on the user's screen only.
- **Chat first.** One folder is one conversation: a unit of work, like a branch and its pull request.
- **The user decides.** Anything that changes the profile, fills a form, signs, pays or sends goes through an approval card.
- **Add-ons for information.** The Services (3615 codes) are packages of their own, built on an SDK; see [services.md](services.md).
- **Reviewed content.** The engines' skills, the guided démarches, the official calendar, the public sites and the news sources are a package of their own, open to contributions through review and updated between releases as a bundle the project signs; see [content.md](content.md).
- Code, identifiers and engine-facing text are in English; everything the user reads is in French.

## The window

```
[◧] MARIANNE  Actualités  Démarches  Services                         ⌕  ⚙  ─ □ ✕
┌────────────────┬───────────────────────────────────────────┬────────────────────┐
│ ⌕ filtre  ＋    │                                           │                    │
│ ● pinned       │     the page, or the open folder          │  built-in browser  │
│ ● folders…     │                                           │  (a folder's, when │
│ ▸ En veille    │                                           │   shown)           │
│ ▸ Classés      │                                           │                    │
│ [account ▾]    │                                           │                    │
├────────────────┴───────────────────────────────────────────┴────────────────────┤
│ 🔒 CL● CX◐ MI✕                                   SUITE pg↓  RETOUR pg↑  SOMMAIRE │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Title bar**: the sidebar toggle; MARIANNE (a new folder, on the composer); the pages, the current one as an inverse block; search and settings; the system's window buttons. Full screen is F11, without a button.
- **Sidebar** (after T3 Code): search, filter by domain (shift+click for several), new folder; rows with domain badge, pin, status or time, title, a meta line and the engine badge; on hover, snooze and settle. "En veille" and "Classés" fold at the bottom. The account selector sits in the footer; its menu shows the archive gauge under the name, then Réglages, Archive, Changer de compte, Verrouiller.
- **Bottom bar**: the lock, then each enabled engine with its light (● ready, ◐ working, greyed ✕ enabled but not found); on the right, the Minitel keys of the screen.
- **Pages**, in this order, each separate (scrolling never switches): Marianne (the composer), Actualités, Démarches, Services. ▼ at the bottom, SUITE pg↓ / RETOUR pg↑ and ctrl+↓/↑ go to the next or previous one, at once (a Minitel had no transitions).
- **Settings**: a dialog over the app, grouped MOI (identity, household, documents), ARCHIVE (space, security, accounts), CONNEXIONS (sites, engines, browser, privacy, public data), PAGES (services, Actualités sources), APPLICATION (display, shortcuts, skills, about).
- **Keyboard**: ctrl+k commands, ctrl+space the menu (the Minitel's SOMMAIRE), ctrl+alt+space search, ctrl+enter Marianne, ctrl+1/2/3 Actualités / Démarches / Services. CommandOrControl everywhere (cmd on macOS); every shortcut can be changed.
- **Look**: Minitel touches on a clean monospace screen: inverse blocks, codes, function keys; the pixel font for titles and codes only; the old screen's lines and glow are an option.

## Folders

A folder has a title, a domain, an engine, its conversation and its pièces (documents of the archive). It may follow a guided procedure (a démarche of the [content](content.md)), step by step: its header shows the steps, and the actions of the one in progress (open a site or a Service-Public sheet in its browser, fill in a setting, add a pièce, ask Marianne, open a service).

- Pinned folders stay on top and are never settled automatically.
- Snoozed ("en veille") until a date, a folder comes back on its own and shows it.
- Settled ("classé") by hand; automatically when its procedure's last step is done, or after 7 days without activity when it follows no procedure. A new message reopens it.

## The archive

One file per account, `<8-hex-id>.marianne`, in a folder the user chooses (others can be opened from anywhere). The account shows its random id, and optionally initials or a first name.

- **Format**: SQLite (`node:sqlite`, exclusive lock, incremental vacuum). One plaintext row describes the vault; every record and every file chunk (1 MiB) is AES-256-GCM, with associated data naming its place (`records/<kind>/<id>`, `chunks/<id>/<n>`…).
- **Keys**: a random data key, wrapped by the password key and by the recovery key; changing the password rewraps it, instantly. Keys come from scrypt: N=2¹⁸, r=8, p=1 (256 MiB, about a second) for the password; N=2¹⁶ for the recovery key and the PIN. Argon2 isn't available in Electron's crypto.
- **Master password**: the archive can be attacked offline, so the password must resist that: an estimated 10²⁵ guesses or more (over a billion years at 10⁸ guesses per second). No character is required; the estimate (zxcvbn's French and English dictionaries, names, common passwords, keyboard runs, dates and repeats, the rest at its alphabet's size) is what counts. The user's own names count as guessable. Marianne offers a generated password.
- **Recovery key**: 25 characters (Crockford base32), shown once at creation, renewable.
- **PIN**: after the full password once on a computer, the user may set a PIN (6 to 12 digits, no repetition or sequence). A device secret kept by the OS credential store (Keychain, DPAPI, libsecret) and the PIN wrap the data key; 5 wrong PINs erase it. No PIN where the store is a plain file (Linux without a keyring).
- **Capacity**: 1 GiB; a warning at 80 %, new pièces refused at 100 %.
- **Locking**: by hand, after inactivity, when the computer sleeps or locks its screen. Locking drops the key, cancels running turns, wipes the engines' scratch folders and the opened copies, and clears the built-in browser's cookies. Nothing personal is ever written in clear but those temporary copies.

## Engines

Claude Code (CL), Codex (CX) and Mistral Vibe (MI) are the user's own CLIs. Each can be turned on or off; its setting is its configuration folder (`~/.claude`, `~/.codex`, `~/.vibe`), its program being found on its own.

- They run in an empty scratch folder, with no shell and no file tools: only Marianne's MCP server (loopback, a token per launch, the folder's id in its URL) and, depending on the setting, web search and public sites.
- Each folder keeps each engine's session; transcripts are captured into the archive after each turn and put back before the next. Claude compacts at 300 000 tokens (`autoCompactWindow`).
- The system prompt and every message are in English; the engine answers in French.

## Tools, cards and the browser

Marianne's MCP tools read the profile, propose changes (an approval card), follow procedures, read pièces (masked), search Service-Public, compute deadlines, estimate benefits, query public data, and drive the built-in browser. The MCP server resolves `[[tokens]]` in arguments and scrubs results before they go back.

The built-in browser is a folder's: shown in the right column or kept out of sight. Going online needs consent (once per folder or per site); signing, paying and sending always need approval; the user can take control ("prendre la main") at any time, and Marianne hands over for CAPTCHAs, codes and FranceConnect. Its cookies live in memory only.

## Public information

- **Connexions**: the public sources Marianne uses (Service-Public, indexed offline; Légifrance with the user's API key; data.gouv.fr; the companies directory; communes and addresses; the official calendar; OpenFisca). Each can be turned off or pointed elsewhere.
- **Actualités**: headlines of the sources the user picks (title, time, link; never the article), "Aujourd'hui" (holidays, school holidays, clock changes, changes in force today, and what services add, such as the Assemblée's sittings) and "En France" (what changes, public services' news). Copy a link, or ask Marianne.
- **Services**: apps with a code, starred ones first, grouped by category; not tied to folders. Each is an add-on package (see [services.md](services.md)).
- **Content**: the public sites, the news sources and the yearly dates of the official calendar come from the content ([content.md](content.md)), built in and replaced by a newer bundle when the project publishes one it signed.

## The code

```
apps/desktop/             the app (Electron): its package, build and packaging
  src/main/               the main process: what runs on Electron, and the wiring
    engines/              Claude Code, Codex, Vibe: runs, prompt, skills, transcripts
    profile/              the profile's store and documents, in the archive
    content/              the content in use: built in, or a newer signed bundle
    tools/                the MCP tools
    public/               the connections and Actualités
    browser/              the built-in browser
    host/                 the services' host
  src/preload/            window.marianne, from the channel lists
  src/renderer/src/       the window (React)
  src/shared/             what the main process and the window share: channels, settings, types
  resources/              icons the app reads at run time
  build/                  the installers' icons and entitlements
  test/                   the app's tests (test/renderer: the window's)
packages/
  sdk/                    @marianne/sdk: the contract with the services, and their tests' context
  archive/                @marianne/archive: the encrypted archive, PIN, accounts, session
  profile/                @marianne/profile: the profile's model, domains, tokens, deadlines, context view
  content/                @marianne/content: skills, démarches, calendar, sites, news sources
services/<code>/          @marianne/service-<code>: the built-in services
scripts/                  the repository's checks
```

Three kinds of packages: `apps/` is what ships, `packages/` the libraries the app and the services import, `services/` the add-ons built on the SDK, each with its manifest. A folder is a package when something other than the app needs it (the SDK: the services; the content: the review and the bundles; each service), or when it is a boundary worth holding on its own: the archive (the user's data at rest) and the profile (where identifiers become tokens) are small, free of Electron, and can be read and tested without the app around them. The app's other modules stay in the app; the engines and the tools would become packages once something else needs them.

What may import what:

```
apps/desktop      any package, any service
services/<code>   @marianne/sdk only
content           @marianne/sdk
profile           @marianne/sdk, @marianne/content
archive, sdk      nothing of Marianne
```

A package imports another by its name, never by a path; only the apps run on Electron; in `packages/`, React is for the SDK's views only. `scripts/check-boundaries.mjs` holds these rules, in `npm run check` and in CI: a new package gets its line there.

`npm run check` runs Prettier, a check that no `.gitkeep` is left beside other files, the package boundaries, the type checks (the app, then every package) and the tests (the app's and every package's).
