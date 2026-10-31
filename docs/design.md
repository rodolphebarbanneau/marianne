# Marianne: design

Marianne is a desktop citizen assistant for people living in France: their rights, their formalities, their papers and deadlines, and public information. The user works with Marianne in conversations; Marianne works through the user's own AI engine (Claude Code, Codex or Mistral Vibe), which only reaches the user's data through Marianne, masked.

## Principles

- **Local and private.** Personal information never goes to a server of ours: there is none. Each account is one encrypted archive on the user's computer.
- **Masked for the engines.** Identifiers (social security number, tax number, names, address, IBAN…) are replaced by `[[tokens]]` before anything reaches an engine, and put back on the user's screen only. A household member's, a company's, an employer's, a vehicle's or a home's tokens carry its number (`[[vehicle.2.plate]]`), given once and kept: a token in an earlier conversation or a planned task still means the same record when one before it is deleted.
- **Chat first.** One folder is one conversation: a unit of work, like a branch and its pull request.
- **The user decides.** Anything that changes the profile, fills a form, signs, pays or sends goes through an approval card.
- **Add-ons for information.** The Services (3615 codes) are packages of their own, built on an SDK; see [services.md](services.md).
- **Reviewed content.** The engines' skills, the guided démarches, the official calendar, the public sites and the news sources are a package of their own, open to contributions through review and updated between releases as a bundle the project signs; see [content.md](content.md).
- Code, identifiers and engine-facing text are in English; everything the user reads is in French.

## The window

```
[◧] MARIANNE  Démarches  Services                                    ⌕ ⚙ ↻  ─ □ ✕
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

- **Title bar**: the sidebar toggle; MARIANNE (a new folder, on the composer); the pages, the current one as an inverse block; search, settings and reload; the system's window buttons. Full screen is F11 (ctrl+cmd+F on macOS), without a button.
- **Sidebar** (after T3 Code): search, filter by domain (shift+click for several), new folder; rows with domain badge, pin, status or time, title, a meta line and the engine badge; on hover, snooze and settle. "En veille" and "Classés" fold at the bottom. The account selector sits in the footer; its menu shows the archive gauge under the name, then Réglages, Archive, Changer de compte, Verrouiller.
- **Bottom bar**: the lock, then each enabled engine with its light (● ready, ◐ working, greyed ✕ enabled but not found); on the right, the Minitel keys of the screen.
- **Pages**, in this order, each separate (scrolling never switches): Marianne (the composer), Démarches, Services. The news is a service, 3615 INFOS, one of a new account's services. ▼ at the bottom of Marianne's page, SUITE pg↓ / RETOUR pg↑ and ctrl+↓/↑ go to the next or previous one, at once (a Minitel had no transitions).
- **The head**: Services, Démarches and a domain's page open the same way (`KioskHead`), so that they read as one app: a double frame, a line above a bar, the bar with its block and ENVOI, a pixel art on the right; tabs under it, and only what is under the tabs scrolls. Services asks QUEL SERVICE ?, its block 3615, its art the Minitel, with the tabs mes services and découvrir on F2 and F3. Démarches asks QUELLE DÉMARCHE ?, its block GUICHET, its art a ticket machine, with the tabs mes domaines, à faire and tâches planifiées on F2 to F4. A domain is a numbered counter, as a service has its code: typing 8 prints a ticket showing 08, ENVOI opens Mobilité, and on its page, whose block says GUICHET 8, the ticket stays out. There the bar takes a question, which opens a folder filed in the domain, and the tabs, on F2 to F5, are aperçu, tâches planifiées, dossiers and ressources. The three pages' tabs are a service's screen's (`KeyTabs`, `.service-tab`), each with its key, and the bottom bar says them as a service's does.
- **Settings**: a dialog over the app, grouped MOI (identity, household, documents), ARCHIVE (space, security, accounts), CONNEXIONS (sites, engines, browser, privacy, public data), PAGES (services), APPLICATION (display, shortcuts, skills, about).
- **Keyboard**: ctrl+k commands, ctrl+space the menu (the Minitel's SOMMAIRE), ctrl+alt+space search, ctrl+enter Marianne, ctrl+2/3 Démarches / Services (ctrl+1 was the Actualités page's: the others kept their keys), ctrl+b the sidebar, ctrl+l the lock, ctrl+shift+r reload (`shared/shortcuts.ts`). CommandOrControl everywhere (cmd on macOS), but the menu and search, which keep ctrl there (cmd+space is Spotlight's), and full screen. Every shortcut can be changed. A page's own Enter and Space leave ctrl+enter and ctrl+space to the app.
- **The mini-player**: a video a service's player hands over (P, or leaving its page while it plays) keeps playing in a corner of the window, over any page, one video at a time ([services.md](services.md#media)).
- **Look**: Minitel touches on a clean monospace screen: inverse blocks, codes, function keys; the pixel font for titles and codes only; the old screen's lines and glow are an option.

## Folders

A folder has a title, a domain, an engine, its conversation and its pièces (documents of the archive). It may follow a guided procedure (a démarche of the [content](content.md)), step by step: its header shows the steps, and the actions of the one in progress (open a site or a Service-Public sheet in its browser, fill in a setting, add a pièce, ask Marianne, open a service).

- Pinned folders stay on top and are never settled automatically.
- Snoozed ("en veille") until a date, a folder comes back on its own and shows it.
- Settled ("classé") by hand; automatically when its procedure's last step is done, or after 7 days without activity when it follows no procedure and holds no planned task. A new message reopens it. One the user takes out of "Classés" by hand stays out of the automatic rule until its next message.
- A folder may hold one planned task: it sleeps between two runs and comes back on the task's day ([below](#planned-tasks)).

## The archive

One file per account, `<8-hex-id>.marianne`, in a folder the user chooses (others can be opened from anywhere). The account shows its random id, and optionally initials or a first name.

- **Format**: SQLite (`node:sqlite`, exclusive lock, incremental vacuum). One plaintext row describes the vault; every record and every file chunk (1 MiB) is AES-256-GCM, with associated data naming its place (`records/<kind>/<id>`, `chunks/<id>/<n>/of/<count>`…): a record or a chunk moved, altered or taken out (a document's last chunks) makes it unreadable, never quietly different. Chunks sealed before their count (0.1.0-alpha.2 and earlier, `chunks/<id>/<n>`) are read as they are and checked against the file's size.
- **Keys**: a random data key, wrapped by the password key and by the recovery key; changing the password rewraps it, instantly. Keys come from scrypt: N=2¹⁸, r=8, p=1 (256 MiB, about a second) for the password; N=2¹⁶ for the recovery key and the PIN. Argon2 isn't available in Electron's crypto.
- **Master password**: the archive can be attacked offline, so the password must resist that: an estimated 10²⁵ guesses or more (over a billion years at 10⁸ guesses per second). No character is required; the estimate (zxcvbn's French and English dictionaries, names, common passwords, keyboard runs, dates and repeats, the rest at its alphabet's size) is what counts. The user's own names count as guessable. Marianne offers a generated password.
- **Recovery key**: 25 characters (Crockford base32), shown once at creation, renewable.
- **PIN**: after the full password once on a computer, the user may set a PIN (6 to 12 digits, no repetition or sequence). A device secret kept by the OS credential store (Keychain, DPAPI, libsecret) and the PIN wrap the data key; 5 wrong PINs erase it. No PIN where the store is a plain file (Linux without a keyring).
- **Capacity**: 1 GiB; a warning at 80 %, new pièces refused at 100 %.
- **Locking**: by hand, after inactivity, when the computer sleeps or locks its screen. Locking drops the key, cancels running turns, wipes the engines' scratch folders and the opened copies, and clears the built-in browser's cookies. Nothing personal is ever written in clear but those temporary copies.

## Engines

Claude Code (CL), Codex (CX) and Mistral Vibe (MI) are the user's own CLIs. Each can be turned on or off; its setting is its configuration folder (`~/.claude`, `~/.codex`, `~/.vibe`), its program being found on its own.

- They run in an empty scratch folder, with no shell and no file tools: only Marianne's MCP server (loopback, a token per launch, the folder's id in its URL) and, depending on the setting, web search and public sites.
- Each folder keeps each engine's session; transcripts are captured into the archive after each turn and put back before the next. Claude compacts at 300 000 tokens by default (`autoCompactWindow`; Réglages › Moteurs offers 150 000 to 800 000).
- Where to get each one is its `site` (the "not found" message): claude.com/product/claude-code, chatgpt.com/codex (Codex comes with ChatGPT's plans), mistral.ai/products/vibe. The user signs in with the CLI's own sign-in; « se connecter » in Réglages › Moteurs opens it in a terminal (`login`).
- The system prompt and every message are in English; the engine answers in French.

## Tools, cards and the browser

Marianne's MCP tools read the profile, propose changes (an approval card), follow procedures, read pièces (masked), search Service-Public, compute deadlines, estimate benefits, query public data, and drive the built-in browser. The MCP server resolves `[[tokens]]` in arguments and scrubs results before they go back.

The built-in browser is a folder's: shown in the right column or kept out of sight. Going online needs consent (once per folder or per site); signing, paying and sending always need approval; the user can take control ("prendre la main") at any time, and in a conversation Marianne hands over for CAPTCHAs, codes and FranceConnect. Its cookies live in memory only.

When Marianne hands over, or opens a site to show it (Réglages › Navigateur › « afficher le navigateur »: when she offers, always, never), the window opens the folder's browser (`renderer/src/browser/reveal.ts`). On another screen the window stays where it is: a toast says which folder asks, and its browser opens when the user goes there (a hand-over waits ten minutes). Marianne asks for the user's attention; she never takes the screen from them.

## Planned tasks

A planned task is a folder that comes back. Between two runs its folder sleeps in "En veille"; on its day it wakes, and either Marianne does the work in it ("Marianne vérifie": the task's instruction, each run a turn of the conversation) or it only comes back with its reminder ("rappel": one line, no engine). The tasks are in the archive (`main/tasks.ts`), their calendar in `shared/tasks.ts`.

- **A day, no hour.** A task needs the archive open: its folder, the profile and the engine's context are all inside, and the archive locks after 15 minutes without use by default, on sleep and on quit. A task set for 8:00 would almost never run at 8:00, so a task has a day and runs at the first opening on or after it; a run later than its day is marked as caught up ("rattrapée"). The price is plain: a task can't protect someone who doesn't open Marianne. Days and weeks count from the last run, so a late run moves the rhythm; months and years keep their date.
- **The scheduler.** 15 seconds after each unlock, then every 5 minutes while unlocked, it runs what is due, oldest first, one at a time, and never during another turn or while the browser is the user's: shown, in their hands, or holding a page a conversation left there in the last half hour. There is one browser, and a run must not take it from them: a turn of theirs interrupts a run, and so does reaching for the browser (opening it, taking it, typing an address). Each run spends the user's engine, so there are at most 12 engine runs a day, cut-short ones included, counted in the archive so that a restart doesn't give the day new ones; reminders don't count. A run has 10 minutes. Locked or interrupted, a run leaves no trace and the task is still due. A task whose service was switched off, or whose plate was taken back, waits.
- **A run looks and reports, and can't do more.** Nobody watches a run, and it reads pages anyone can write, so the rule is enforced in the tools, not asked of the model. A run shows no card and hands nothing over: what would need the user is refused, and it reports "waiting". Of the app's tools it has `open_site`, `click`, `type_text`, `task_progress` and `task_report`, and the reading tools named for runs (`RUN_READS` in `tasks.ts`): its page and what stays on this computer without the user's data (skills, démarches, public sites, a deadline's date), never their profile, deadlines or documents, nor a tool that asks a service elsewhere, whose query would leave by a host the sheet doesn't list; a new tool stays out until it is named. Of the services', its own service's. It can't fill a form, sign in or plan a task. It clicks only what plainly searches or moves through a page, never what could commit (`reading` in `tools/online.ts`), and types only the identifier of the entity the user agreed to, exactly: nothing else, and nothing at all for a task without one. No other tool carries an identifier out of a run. The engine's own web tools are off. It ends by saying how it went (`task_report`): nothing, found, waiting or failed; a run that doesn't say is shown to the user, to read again. A run is an engine session of its own, told its task only, never the conversation; nothing of it is kept for the folder's session (no transcript), and the user's next turn hears only what runs reported since theirs, labelled as a run's: information, never instructions. A quiet run leaves its folder as it was.
- **Per-run site grants.** A run reaches the hosts listed on its task and what is under them, over https, for that run only, and nothing else (« www.x » is that site, with or without its www, not every host under x; a task proposed in a conversation names one site, never a whole hosting service such as github.io). It browses in a view and a session of its own, emptied before and after each run: it never has the user's sign-ins, and their page waits aside. The browser holds its page there before any request leaves (`browser/run-guard.ts`): a link, a form, a script, a frame or a server's redirect elsewhere is stopped, a popup opens only on those hosts, nothing downloads and nothing goes to the system (mail, phone); the tools check again where the page landed. It neither reads the folder's consents nor adds to them: those were given to a conversation. Each call keeps to the run it started in, and one the run outlives (the user's message stopped it while a page loaded) stops rather than go on as a conversation's. Its browser stays out of sight.
- **What comes back.** A task's folder wakes by its run, not by its date. A run that found nothing leaves it asleep, or awake if the user hadn't read what it held, and folds with the others into one line of the conversation. Anything else wakes the folder and notifies the user; à faire lists the tasks that wait or failed until the user has opened them. A task's folder the user has read goes back to sleep after a day; paused, it goes to "Classés".
- **Where a task comes from.** Nothing runs without the user's yes: on a sheet built from what a service proposes (`tasks()`, built-in services only, see [services.md](services.md)), for a reminder of their own, or on a card when Marianne proposes one in a conversation (`task_propose`). That card shows the instruction word for word, and the task keeps showing it: the user can always read what comes back. A task's sites and instruction come from the service or from that card, never from the window.

## Public information

- **Connexions**: the public sources Marianne uses (`shared/public.ts`: Service-Public, indexed offline; Légifrance with the user's API key; the Code du travail numérique; data.gouv.fr; the companies directory; communes and addresses; public holidays; OpenFisca). Each can be turned off in Réglages › Données publiques; its address (`url`, in `~/.marianne/config.json`) can point elsewhere.
- **3615 INFOS**: the news, as a service (`services/infos`). Marianne reads every source of the content's list, whatever the user chose, so that no outlet can tell which ones they read; keeps 7 days of titles; groups the titles of different sources that say the same thing into subjects; and hands them to the services that declare `news` (`ctx.news`, see [services.md](services.md#news)). INFOS reaches no site itself. It shows the title, the time, the link and the feed's summary and, for the one title a subject shows, the start of the article (600 characters at most, read on demand, never past a paywall); the article opens at the source. The sources a user reads are a profile field (`opinions.sources`, Réglages › Identité › sources d'information), sensitive like the leaning: never ticked in advance, never given to the engines, shared service by service. Each source's colour is its editorial line, Marianne's by default or the user's own: colours show, and place the sources from left to right (`byLean`); they never rank the news, hide or pick a source.
- **Services**: apps with a code, not tied to folders, in two tabs: « mes services » (the pinned ones as tiles, then all of the user's in a table) and « découvrir » (see [services.md](services.md#the-services-page)). Each is an add-on package (see [services.md](services.md)) in the same frame: the 3615 header and the tabs its manifest declares (F2, F3…), fixed above its screen, and its guide on F1; what a page waits for, a box in its middle.
- **Content**: the public sites, the news sources and the yearly dates of the official calendar come from the content ([content.md](content.md)), built in and replaced by a newer bundle when the project publishes one it signed.

## The code

```
apps/desktop/             the app (Electron): its package, build and packaging
  src/main/               the main process: what runs on Electron, and the wiring
    engines/              Claude Code, Codex, Vibe: runs, prompt, skills, transcripts
    profile/              the profile's store and documents, in the archive
    content/              the content in use: built in, or a newer signed bundle
    tools/                the MCP tools
    public/               the connections and the news reader (ctx.news)
    browser/              the built-in browser
    host/                 the services' host
    community/            community services: the catalogue, .3615 files, their sandboxes (runtime/)
  src/preload/            window.marianne, from the channel lists
  src/renderer/src/       the window (React)
  src/shared/             what the main process and the window share: channels, settings, types
  src/runtime/            the pages a community service runs in (its main side's, its screen's)
  resources/              icons the app reads at run time
  build/                  the installers' icons and entitlements
  test/                   the app's tests (test/renderer: the window's)
packages/
  sdk/                    @marianne/sdk: the contract with the services, the views' blocks, the media
                          player, marianne-pack, and their tests' context
  archive/                @marianne/archive: the encrypted archive, PIN, accounts, session
  profile/                @marianne/profile: the profile's model, domains, tokens, deadlines, context view
  content/                @marianne/content: skills, démarches, calendar, sites, news sources
services/<code>/          @marianne/service-<code>: the built-in services
docs/                     design, services, content; the user guide in docs/guide/<language>/
site/                     the website (Astro), a project of its own outside the workspace
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

`npm run check` runs Prettier, a check that no `.gitkeep` is left beside other files, the package boundaries, the type checks (the app, then every package and service) and the tests (the app's, every package's and every service's).
