# Marianne: design

Marianne is a desktop citizen assistant for people living in France: their rights, formalities, papers and deadlines, and public information. The user works with Marianne in conversations. Marianne works through the user's own AI engine (Claude Code, Codex or Mistral Vibe), which reaches the user's data only through Marianne, masked.

## Principles

- **Local and private.** Personal information never goes to a server of ours: there is none. Each account is one encrypted archive on the user's computer.
- **Masked for the engines.** Identifiers (social security number, tax number, names, address, IBAN…) become `[[tokens]]` before anything reaches an engine, and are put back on the user's screen only.
  - A household member's, a company's, an employer's, a vehicle's or a home's tokens carry its number (`[[vehicle.2.plate]]`), given once and kept. A token in an earlier conversation or a planned task still means the same record after an earlier one is deleted.
- **Chat first.** One folder is one conversation: a unit of work, like a branch and its pull request.
- **The user decides.** Anything that changes the profile, fills a form, signs, pays or sends goes through the user's approval: on a card, or ahead, by what the user set for going online, filling forms on a site or saving deadlines (their level, a standing permission), or for one turn by their click on a planned task's follow-up, shown in the conversation and revocable. Signing, paying, sending, submitting, declaring, certifying and deleting take a card every time, at every level; paying, the payment card ([below](#tools-cards-and-the-browser)). On a site one of Marianne's own services declares, she clicks the steps on the way without a card: what would pay there without the payment card asks when the page shows it (a card's fields, the user's account open), and otherwise rests on the engine flagging it.
- **Add-ons for information.** The Services (3615 codes) are packages of their own, built on an SDK: see [services.md](services.md).
- **Reviewed content.** The engines' skills, the guided démarches, the official calendar, the public sites and the news sources are a package of their own, reviewed, and updated between releases as a bundle the project signs: see [content.md](content.md).
- **Two languages.** Code, identifiers and engine-facing text are in English; everything the user reads is in French.

## The window

```
[◧] MARIANNE  Démarches  Services                                    ⌕ ↻ ⚙  ─ □ ✕
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

### The bars

- **Title bar**: the sidebar toggle; MARIANNE (a new folder, on the composer); the pages, the current one as an inverse block; search, reload, settings and the bug (« signaler un bug », [below](#engines)); the system's window buttons. Full screen is F11 (ctrl+cmd+F on macOS), with no button.
- **Sidebar** (after T3 Code):
  - at the top, search, a filter by domain (shift+click for several) and a new folder;
  - each row: domain badge, pin, status or time, title, a meta line and the engine badge; on hover, snooze and settle;
  - "En veille" and "Classés" fold at the bottom;
  - the account selector in the footer. Its menu shows the archive gauge under the name, then Réglages, Archive, Changer de compte, Verrouiller.
- **Bottom bar**: the lock; each enabled engine with its light (● ready, ◐ working, greyed ✕ enabled but not found); on the right, the Minitel keys of the screen.

### The pages

Three pages, in this order: Marianne (the composer), Démarches, Services. Each is separate: scrolling never switches page. ▼ at the bottom of Marianne's page, SUITE pg↓ / RETOUR pg↑ and ctrl+↓/↑ go to the next or previous one, at once (a Minitel had no transitions). The news is a service, 3615 INFOS, one of a new account's services.

Services, Démarches and a domain's page open with the same head (`KioskHead`), so that they read as one app: a double frame, a line above a bar, the bar with its block and ENVOI, a pixel art on the right, then tabs. Only what is under the tabs scrolls.

| page      | the bar asks      | its block | its art          | its tabs                                                   |
| --------- | ----------------- | --------- | ---------------- | ---------------------------------------------------------- |
| Services  | QUEL SERVICE ?    | 3615      | the Minitel      | mes services, découvrir (F2, F3)                           |
| Démarches | QUELLE DÉMARCHE ? | GUICHET   | a ticket machine | mes domaines, à faire, tâches planifiées (F2 to F4)        |
| a domain  | a question        | GUICHET 8 | a ticket machine | aperçu, tâches planifiées, dossiers, ressources (F2 to F5) |

- A domain is a numbered counter, as a service has its code: on Démarches, typing 8 prints a ticket showing 08, and ENVOI opens Mobilité. On its page the ticket stays out.
- A domain's bar takes a question, which opens a folder filed in that domain.
- The three pages' tabs are a service screen's (`KeyTabs`, `.service-tab`), each with its key, and the bottom bar shows them as a service's does.
- **Services** are apps with a code, not tied to folders. Each opens in the same frame: the 3615 header, the tabs its manifest declares (F2, F3…) fixed above its screen, and its guide on F1 ([services.md](services.md#the-services-page)).

### Settings, keys and the rest

- **Settings**: a dialog over the app, in five groups: MOI (identity, household, documents, payment), ARCHIVE (space, security, accounts), CONNEXIONS (sites, engines, browser, approvals, privacy, public data), PAGES (services), APPLICATION (display, shortcuts, skills, about).
- **Keyboard** (`shared/shortcuts.ts`): every shortcut can be changed.

  | keys           | what                                                       |
  | -------------- | ---------------------------------------------------------- |
  | ctrl+k         | commands                                                   |
  | ctrl+space     | the menu (the Minitel's SOMMAIRE)                          |
  | ctrl+alt+space | search                                                     |
  | ctrl+enter     | Marianne (a new folder)                                    |
  | ctrl+2, ctrl+3 | Démarches, Services (ctrl+1 was the old Actualités page's) |
  | ctrl+b         | the sidebar                                                |
  | ctrl+l         | lock                                                       |
  | ctrl+shift+r   | reload                                                     |
  - ctrl is CommandOrControl (cmd on macOS), except for the menu and search, which keep ctrl (cmd+space is Spotlight's), and full screen.
  - A page's own Enter and Space leave ctrl+enter and ctrl+space to the app.

- **The mini-player**: a video a service's player hands over (P, or leaving its page while it plays) keeps playing in a corner of the window, over any page, one video at a time ([services.md](services.md#media)).
- **Look**: Minitel touches on a clean monospace screen: inverse blocks, codes, function keys. The pixel font is for titles and codes only. The old screen's lines and glow are an option.

## Folders

A folder has a title, a domain, an engine, its conversation and its pièces (documents of the archive).

- **A guided procedure.** A folder may follow a démarche of the [content](content.md), step by step. Its header shows the steps and the actions of the one in progress: open a site or a Service-Public sheet in its browser, fill in a setting, add a pièce, ask Marianne, open a service.
- **Pinned** folders stay on top and are never settled automatically.
- **Snoozed** ("en veille") until a date, a folder comes back on its own and shows it.
- **Settled** ("classé"):
  - by hand;
  - automatically when its procedure's last step is done, or after 7 days without activity when it follows no procedure and holds no planned task;
  - a new message reopens it. One the user takes out of "Classés" by hand stays out of the automatic rule until its next message.
- **A planned task.** A folder may hold one: it sleeps between two runs and comes back on the task's day ([below](#planned-tasks)).

## The archive

One file per account, `<8-hex-id>.marianne`, in a folder the user chooses; others can be opened from anywhere. The account shows its random id, and optionally initials or a first name.

- **Format**: SQLite (`node:sqlite`, exclusive lock, incremental vacuum).
  - One plaintext row describes the vault. Every record and every file chunk (1 MiB) is AES-256-GCM.
  - Each one's associated data names its place (`records/<kind>/<id>`, `chunks/<id>/<n>/of/<count>`…). A record or a chunk moved, altered or taken out (a document's last chunks) becomes unreadable, never quietly different.
  - Chunks sealed before their count was named (0.1.0-alpha.2 and earlier, `chunks/<id>/<n>`) are read as they are and checked against the file's size.
- **Keys**: a random data key, wrapped by the password key and by the recovery key; changing the password rewraps it, instantly. Keys come from scrypt (Argon2 isn't available in Electron's crypto):
  - the password: N=2¹⁸, r=8, p=1 (256 MiB, about a second);
  - the recovery key and the PIN: N=2¹⁶.
- **Master password**: the archive can be attacked offline, so the password must resist an estimated 10²⁵ guesses or more (over a billion years at 10⁸ guesses per second).
  - No character class is required: the estimate is what counts. It uses zxcvbn's French and English dictionaries, names, common passwords, keyboard runs, dates and repeats, the rest at its alphabet's size.
  - The user's own names count as guessable.
  - Marianne offers a generated password.
- **Recovery key**: 25 characters (Crockford base32), shown once at creation, renewable.
- **PIN**: after the full password once on a computer, the user may set a PIN (6 to 12 digits, no repetition or sequence).
  - A device secret kept by the OS credential store (Keychain, DPAPI, libsecret) and the PIN wrap the data key; 5 wrong PINs erase it.
  - No PIN where the store is a plain file (Linux without a keyring).
- **Secrets**: the keychain's logins and API keys, and the payment cards (Réglages › Paiement: a label, the holder, the number, the expiry, and the security code only when the user ticks « enregistrer le cryptogramme » for that card), are records like the others. Only the main process reads them, to sign in or to pay after the user's yes: a card's number and code never go back to the window once saved, nor to an engine, an export or the log.
- **Capacity**: 1 GiB; a warning at 80 %, new pièces refused at 100 %.
- **Locking**: by hand, after inactivity, or when the computer sleeps or locks its screen. Locking drops the key, cancels running turns, wipes the engines' scratch folders and the opened copies, and clears the built-in browser's cookies. Those temporary copies are the only personal data ever written in clear.

## Engines

Claude Code (CL), Codex (CX) and Mistral Vibe (MI) are the user's own CLIs, each turned on or off. Its setting is its configuration folder (`~/.claude`, `~/.codex`, `~/.vibe`); its program is found on its own.

- **Confined.** They run in an empty scratch folder, with no shell and no file tools. They reach only Marianne's MCP server (loopback, a token per launch, the folder's id in its URL) and, depending on the setting, web search and public sites.
- **Sessions.** Each folder keeps each engine's session: its transcript goes into the archive after each turn and comes back before the next. Claude compacts at 300 000 tokens by default (`autoCompactWindow`; Réglages › Moteurs offers 150 000 to 800 000).
- **Installing and signing in.** Marianne needs the CLI itself: the makers' desktop apps carry their own copies, off the PATH, and it doesn't use them. Each engine's `site` is the CLI's official install page (the "not found" message): code.claude.com/docs/fr/setup, learn.chatgpt.com/docs/codex/cli (from ChatGPT Plus up, or an API key), docs.mistral.ai/vibe/code/cli/install-setup. The user signs in with the CLI's own sign-in; « se connecter » in Réglages › Moteurs opens it in a terminal (`login`). A turn that fails for want of a sign-in (`signIn` on its end) ends with a « réglage nécessaire » card that opens Réglages › Moteurs.
- **Driving them.** Claude Code goes through Anthropic's Agent SDK (`@anthropic-ai/claude-agent-sdk`), pointed at the user's own `claude` (`pathToClaudeCodeExecutable`) and started the way Marianne starts every CLI (`spawnClaudeCodeProcess`: hidden, its process tree stopped with it). The SDK owns the command line and sends the system prompt and the message over the pipe, so a change in how Claude Code is driven (`--bare` is to become the default of `claude -p`, and reads no subscription) comes with an SDK update. The MCP server's address and token stay in a file. The SDK's own Claude Code binaries and Anthropic's API SDK are left out of the package (`electron-builder.yml`): Marianne ships no engine. Codex runs `codex exec --json`, as OpenAI's Codex SDK does itself; Vibe, `vibe -p`.
- **API keys in the environment.** Each CLI would silently take a key the environment sets ahead of its own sign-in, billed per use: `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` (with `ANTHROPIC_BASE_URL`, the key's endpoint), `CODEX_API_KEY` and `CODEX_ACCESS_TOKEN` (`codex login status` doesn't see the first), `MISTRAL_API_KEY` (ahead of the key Vibe's sign-in stored). Each engine's `keyVars` name them. Its sign-in is read without them; when it has one, Marianne's runs leave the key out, unless the user ticks « utiliser la clé… » in Réglages › Moteurs (`useEnvKey`); with nothing else, the key is used, and said so there and on the bottom bar's light. Never `forced_login_method` for Codex: with a key in the environment, `codex exec` then logs the user out.
- **Language.** The system prompt and every message are in English; the engine answers in French.
- **The prompt** (`engines/prompt.ts`) is generic: Marianne's method, how she acts, the user's profile and its tokens, the browser, letters, planned tasks, the skills' index. No scenario of a domain or a service: what a service is for is in its own instructions and guides ([services.md](services.md#what-activate-returns)).
  - **Acting.** The user decides; Marianne carries out what they decided, and every step that commits them waits for their yes. A concrete thing to do (something owed, a form to file, a document to obtain, a step with a deadline), she goes to the work: the service and the guided procedure that cover it, a service of hers to propose when it isn't on, what is missing to set up, the site to go to and everything to prepare up to the user's decision, and a planned task when it recurs. A situation to navigate (a life event, a broad question), she maps out, explains and proposes, and creates nothing until the user picks. What needs the user's yes, the app asks on a card: she never asks it again in the conversation, nor works around a refusal.
  - **The services.** Those that are on, each with its instructions; then Marianne's own that aren't (not added, switched off), one line each: code, name, description, domains. Never a community service that isn't on.
- **A turn lists its tools as it starts.** Each turn is a new process of the CLI, which lists Marianne's tools once, as it connects; the MCP server is stateless (no stream back to the engine), so it can't tell it of a change. A service added during a turn lends its tools only from the next one, and the system prompt that names it is built for the next one too. So when the user adds a service from Marianne's card ([below](#tools-cards-and-the-browser)), the chat runner starts one more turn as that turn ends, in the folder's session, opened by a line (« 3615 PEAGE ajouté · Marianne reprend »): its message to the engine says the service is on and to carry on with the user's request. Once per addition, only after a turn that ended well, never from a planned task's run.
- **Bug reports.** « signaler un bug » has the user's engine write up a bug for GitHub (`main/bug-report.ts`, `main/bug-reporter.ts`, `renderer/src/app/bug-report.tsx`):
  - it reads the user's words and the app's diagnostics: version, system, engine, screen, the window's last errors (kept in memory only), the open folder's course without its words, the log's end;
  - all of it is scrubbed before, and its answer after: the profile's tokens, the stored card numbers, the home folder, the account's name, emails, phones, IBANs, card numbers, plates, long numbers, addresses past their site;
  - it works in a session of its own, with no web and no tool (its MCP address serves none: `tools=none`), and writes in English;
  - the user reads and edits it all, then opens GitHub's bug form, filled from its address (`shared/bug-report.ts`). GitHub fills only text fields that way, so the form's system and engine are inputs. The app sends nothing.

## Tools, cards and the browser

Marianne's MCP tools:

- read the profile, and propose changes to it (an approval card);
- follow procedures and read pièces (masked);
- know the services (`services`), and propose one of Marianne's own that isn't on (`service_propose`);
- plan a task (`task_propose`), the user's yes on a card;
- search Service-Public, compute deadlines, estimate benefits, query public data;
- drive the built-in browser, and pay by card there (`pay_by_card`), the user's yes on a card each time.

The MCP server resolves `[[tokens]]` in a tool's arguments and scrubs its result before it goes back to the engine, of the stored card numbers too.

One place decides whether an action waits for the user's yes on a card: the approval policy (`shared/approvals.ts`, pure), from the account's level, its standing permissions and the floor; `main/approvals.ts` then shows the card, or the line of what was allowed ahead. Each tool says what it asks to do:

| action  | covers                                     | allowed ahead                                                       |
| ------- | ------------------------------------------ | ------------------------------------------------------------------- |
| online  | going to a site from a folder              | yes: « toujours pour sanef.com »                                    |
| form    | `fill_form` on a site                      | yes: « toujours pour les formulaires de sanef.com »                 |
| profile | `propose`                                  | adding or updating a deadline only: « toujours pour les échéances » |
| task    | `task_propose`                             | no                                                                  |
| commit  | a consequential click; a payment by card   | never, at any level: the floor                                      |
| service | a call to a community service not reviewed | no                                                                  |
| add     | `service_propose`: a service to add        | no: the user adds it, in « avant d’ajouter »                        |

- **The level** (Réglages › Autorisations): « tout demander » asks going online for each new site of each folder; « équilibré », the default, once per folder; at both, every form and every save to the profile asks. « autonomie » goes without asking to the sites Marianne knows (the content's public sites, and the sites her own services that are on declare: [services.md](services.md#the-manifest)), fills forms and saves deadlines there, and asks other sites once per folder.
- **Standing permissions**: a card of a kind that can be allowed ahead offers « toujours… » between « approuver » and « refuser ». The permission is kept in the account's settings, for every folder, and listed in Réglages › Autorisations with when it was given and « retirer ». The main process keeps the one the card offered, never one the window names, and the window can only take one back.
- **The floor**: what commits the user (signing, paying, sending, submitting, declaring, certifying, deleting) takes a card for each single action, at every level, and its card says so; nothing allowed ahead covers it. Paying takes the payment card (`pay_by_card`, [below](#tools-cards-and-the-browser)). Nor any other change to the profile (identity, numbers, address, accounts, ID documents, entities, household, any deletion), nor planning a task, nor adding a service.
- **A follow-up's go-ahead**: the user's click on a planned task's follow-up ([below](#what-comes-back)) lets its turn go to the task's sites (by host, as a run's are matched) and fill forms on the hosts the task's service declares, without a card. The chat runner marks that turn (`chat.followUp`, `tasks.followingUp`); the MCP server hands the mark to the tools (`ToolContext.followUp`, as it does a run), so an engine can't claim it; a typed message, the same message answered again or a call the turn outlived gets none. It is kept nowhere: not the folder's consent, not a standing permission. « tout demander » still asks each site and each form, and nothing of the floor is lowered.
- **Seen all the same**: an action allowed ahead shows in the conversation as a line, « autorisé d’office · toujours pour sanef.com », « · autonomie » or the follow-up's label (« · payer maintenant »), with the values of a form or a deadline, and a link to Réglages › Autorisations; going online, once per site and folder. A line or a card that can't be shown is a no.
- **Never in a run**: a planned task's run gets no card and nothing allowed ahead ([below](#what-a-run-may-do-look-and-report)).

**Proposing a service** (`tools/services.ts`). Marianne proposes only her own services, never a community one: those are the user's to find on the Services page.

- `services` lists the services that are on (their tools, and the planned tasks they propose, by template and rhythms), then Marianne's own that are off or not added. A community service only while it is on.
- `service_propose` shows a card: what the service does, the sites it reaches, the sites where Marianne would act for it (its manifest's `sites`), what it would read of the profile and why, the tools it lends. Its button opens « avant d’ajouter » over the conversation (or, for a service the user switched off, « réactiver », as its screen does): adding stays the user's own act there, never the card's answer. What it asks to read of the profile is asked right after, as its screen would the first time, so that it works at once.
- The tool waits for that, its card's wait not counted in the turn's time, and the main process settles the card when the service is on and its access answered. Then Marianne carries on in a turn of her own ([above](#engines)). Refused (« pas maintenant ») or left unanswered, she carries on without it, and doesn't propose it again in that folder: in the session, and from the cards its conversation kept.
- A link to one of Marianne's services the user hasn't added (`marianne:service/<code>`) opens its « avant d’ajouter » at once.

The built-in browser belongs to a folder: shown in the right column, or kept out of sight.

- Going online needs consent. What the user said yes to on a card is the folder's, in memory until the lock. What was allowed ahead covers its own site only: it isn't the folder's consent, and an address that led elsewhere asks for that site on its own. A click that may commit the user asks every time (`consequential` in `tools/online.ts`), except the steps on the way on a site Marianne's own services declare (below); refusing a cookie banner (« tout refuser », « continuer sans accepter ») doesn't.
  - A payment provider's page that a page of a declared site sent the browser to (its form or its link, by `paymentRoute`'s provenance [below](#tools-cards-and-the-browser), the page before on a declared host) counts as that page: whatever let Marianne there (the folder's yes, a standing permission, « autonomie », a follow-up's go-ahead) lets her on, and nothing else does. Otherwise, or opened by an address, it is a site of its own.
  - The pages a payment the user approved leads to are part of it ([below](#tools-cards-and-the-browser)): no going-online card.
- **On a site Marianne's own services declare** (their manifests' `sites`, while they are on: [services.md](services.md#the-manifest)), she clicks the steps on the way without a card: searching, validating, confirming, continuing, accepting, going on to pay. Paying there takes the payment card. A click there asks only when its label or what the engine says it is for binds the user beyond paying (`binding`: signing; sending, transmitting, submitting, filing; declaring; deleting; certifying, attesting, « sur l'honneur », « je m'engage »; subscribing; cancelling a contract; waiving a right; a direct debit's mandate), or when the engine flags it (`consequential`), or when its label reads as paying (`paying`) where something else than the payment card could pay: a frame of the page holds a card's number or code (the user may have typed theirs), or the user's account may be open on the site (Marianne signed in there, or the user had the page in hand: a hand-over, « prendre la main »; by site, for the session, since the browser's sign-ins are every folder's).
  - Since its submit goes without a card, an identifier typed there (`type_text` with a token) asks as a form filled there does ([above](#tools-cards-and-the-browser)): the field and its value on a form card, unless the user allowed that site's forms ahead (a standing permission, « autonomie », a follow-up's go-ahead). Elsewhere, the submit asks.
  - The page is judged where the click happens (the browser's address then), by host: a declared host or one under it, « www.x » standing for x, as a task's sites are matched; never the whole registrable domain, as the « autonomie » level and `pay_by_card` count the sites Marianne knows. paiement.aliae.com declared frees neither www.aliae.com nor aliae.com.
  - What this rests on: a click there that would pay without the payment card and doesn't read as paying where something else could pay (a one-click payment whose label says nothing of it, a card saved in an account the browser was already signed in to before the session) is caught only if the engine flags it. The prompt and the click tool tell it to; the services that declare sites say it for theirs. That is why `sites` is for Marianne's own services, reviewed with them. A second press of a pay button the card's yes already covered asks ([below](#tools-cards-and-the-browser)).
- **A site** is a registrable domain, by the Public Suffix List and its private part (`shared/hosts.ts`, tldts): cfspart.impots.gouv.fr is impots.gouv.fr's, while x.asso.fr and evil.asso.fr are two sites, as are two sites on github.io. The keychain groups its logins the same way.
- The user can take control (« prendre la main ») at any time. In a conversation, Marianne hands over for CAPTCHAs, codes and FranceConnect.
- Its cookies live in memory only.
- **Marianne asks for the user's attention; she never takes the screen from them** (`renderer/src/browser/reveal.ts`). When she hands over, or opens a site to show it (Réglages › Navigateur › « afficher le navigateur »: when she offers, always, never), the window opens the folder's browser. If the user is on another screen, the window stays where it is: a toast says which folder asks, and its browser opens when the user goes there. A hand-over waits ten minutes.

**Paying by card** (`pay_by_card` in `tools/browser.ts`; `main/browser/payment.ts`, `main/cards.ts`). In a conversation only: it stays out of a run's tools, and refuses one all the same. Everything fails closed: a frame, a field or a way there that can't be told apart gets nothing, and the user types their card (`hand_over`).

- **Where.** On a site Marianne knows (the content's public sites and the sites her services that are on declare, by registrable domain), or on a payment provider's page that a page on a declared host sent the browser to (`paymentRoute`, as going online reads it [above](#tools-cards-and-the-browser)). For each page, the browser keeps the origin of the frame that started the navigation, its redirects and a few pages before: the provider's page counts when the page before it is on the site and started the navigation itself (its form, its link; never an advert's frame in it, an address opened or typed, back or reload), every redirect on the way on the site or the provider, directly or through the provider's own pages. Its card then says « via Axepta BNP Paribas pour aliae.com ».
- **Which frames.** The page and its frames on its own site or on a payment provider's hosts (`PROVIDERS`: Payline, Axepta, Paybox, PayZen and Systempay, Stripe, Adyen, Checkout.com, Worldline, Monetico), every frame above them too, https only. A bank's 3-D Secure frame is none of these.
- **Which fields.** A page script tells card fields apart by their `cc-*` autocomplete, then by the words that name them (numéro de carte, date d’expiration, cryptogramme, titulaire; card number, expiry, security code, name on card), never another card's (vitale, grise, d’identité, cadeau…). One number field, one expiry or a month and a year, at most one code and one holder; where several could do, those in the number's own frame. A provider's frame around one unnamed field is read by its name and title.
- **The card**, of kind payment, holds the floor: the site, and the provider whose page or frame takes the number; the page; the card (« Visa •••• 4242 · perso · 09/28 »); the amount the engine read on the page, labelled so; the fields it fills. When the security code isn't stored and the page asks for it, the card has a « cryptogramme » field: what the user types goes with the yes (`respondApproval`'s third argument) to the tool waiting on it, is used once, and is never in the card, the conversation, the log or what an engine reads.
- **The fill.** After the yes, on the page the user saw (its address and its version: any navigation changes it, a fragment's or a script's included), the number and the code are put in at the last moment, frame by frame. A frame that changed, or a field that didn't keep its value, empties what was filled.
- **The pay click.** The same yes covers the one pay click that follows on that page (`PayGrants`): a click that commits and whose label pays (`paying`: never one that also binds the user, « Payer et souscrire », nor one the engine says does), within five minutes and the turn the yes was given in, once; leaving the page, another click that commits or a hand-over ends it. On a site Marianne's own services declare, a pay click it doesn't cover asks while the card's fields are on the page, and still ends the grant. When the pay button is inside the provider's frame, where `click` can't reach, `pay_by_card` presses it itself, and its card says so beforehand.
- **Pressed once.** That press (the click the grant covered, or `pay_by_card`'s own) marks its page: another click there whose label pays would pay again, and asks on a card of the floor, on a declared site too, until the page changes.
- **What follows.** The pages the press leads to are part of the payment the user approved: for five minutes, each page sent by the one before it (a frame of its own site or a payment provider's: `paidOnward`), from the page pressed on, goes without a going-online card: the bank's 3-D Secure, wherever its host, and the way back. Never a page reached by an address, back or reload, nor after another click of Marianne's, an address she opens, a hand-over or the end of the turn. The bank's confirmation itself is the user's: `hand_over`, which then takes the page where they leave it.
- **Masked.** The stored numbers, however their digits are set apart (up to three spaces, no-break spaces, line breaks, dots, dashes or slashes, and characters that show nothing), are masked out of `read_page`, `read_form`, a page given to the conversation, the messages and the notes sent to the engine, every tool result, and the bug report. `read_form` leaves a bank card's fields out and masks the value of one that may be another card's; `read_page` marks them (`type_text` refuses them) and never labels a field that may be a card's by its value.
- **What engines know** of a card: its label, brand, last four digits and expiry, as `pay_by_card` lists them; never in the profile's context view. Without a card, the engine proposes adding one (`request_setup`, target `payment`) or lets the user type it.

## Planned tasks

A planned task is a folder that comes back. Between two runs its folder sleeps in "En veille"; on its day it wakes, in one of two ways:

- **« Marianne vérifie »**: Marianne does the work in it. The task's instruction is sent to the engine, each run a turn of the conversation.
- **« rappel »**: the folder only comes back with its reminder, one line, with no engine.

The tasks are in the archive (`main/tasks.ts`); their calendar is in `shared/tasks.ts`.

### A day, not an hour

A task needs the archive open: its folder, the profile and the engine's context are all inside. The archive locks after 15 minutes without use by default, on sleep and on quit, so a task set for 8:00 would almost never run at 8:00.

- A task has a day, and runs at the first opening on or after it. A run later than its day is marked as caught up (« rattrapée »).
- The price is plain: a task can't protect someone who doesn't open Marianne.
- Days and weeks count from the last run, so a late run moves the rhythm; months and years keep their date.

### The scheduler

- **When**: 15 seconds after each unlock, then every 5 minutes while unlocked, it runs what is due, oldest first, one at a time.
- **Never in the user's way.** There is one browser, and a run must not take it from the user. No run starts during another turn, or while the browser is the user's: shown, in their hands, or holding a page a conversation left there in the last half hour. A turn of theirs interrupts a run, and so does reaching for the browser (opening it, taking it, typing an address).
- **Limits**: each run spends the user's engine, so there are at most 12 engine runs a day, cut-short ones included. They are counted in the archive, so a restart doesn't give the day new ones; reminders don't count. A run has 10 minutes.
- **Interrupted**: a run locked or interrupted leaves no trace, and the task is still due.
- **Waiting**: a task whose service was switched off, or whose plate was taken back, waits.

### What a run may do: look and report

Nobody watches a run, and it reads pages anyone can write. So the rule is enforced in the tools, not asked of the model.

- **No card, no hand-over.** What would need the user is refused, and the run reports "waiting".
- **Its tools** (`RUN_READS` in `tasks.ts` names the reading ones; a new tool stays out until it is named there):
  - of the app's: `open_site`, `click`, `type_text`, `task_progress`, `task_report`;
  - reading tools: its page, and what stays on this computer without the user's data (skills, démarches, public sites, a deadline's date). Never their profile, deadlines or documents, nor a tool that asks a service elsewhere, whose query would leave by a host the task doesn't list;
  - of the services': its own service's only, told the call is a run's (`call.run`), so that one which marks something done (a toll paid) refuses it.
- **No commitment.** It can't fill a form, sign in, pay, plan a task or propose a service. It clicks only what plainly searches or moves through a page, never what could commit (`reading` in `tools/online.ts`).
  - Except on a page that is both one of its task's sites and one its own service declares (a service's task, the service built-in and on): there it clicks through a search as a conversation does, anything short of what binds the user (`binding`) or what the engine flags. The operators' searches say « payer » or « valider », and nothing else would let it look. It can't pay all the same: it has no card, no sign-in and no `pay_by_card`, types only its entity's identifier, and a payment provider's or a bank's page is off its sites.
  - A task Marianne proposed in a conversation, or a site its service doesn't declare, keeps to what plainly reads.
- **One identifier at most.** It types only the identifier of the entity the user agreed to, exactly, and nothing at all for a task without one. No other tool carries an identifier out of a run.
- **No web of its own.** The engine's own web tools are off.
- **It reports.** It ends with `task_report`: nothing, found, waiting or failed. A run that doesn't report is shown to the user, to read again, and offers no follow-up.
- **A session of its own.** A run is told its task only, never the conversation, and nothing of it is kept for the folder's session (no transcript). The user's next turn hears only what runs reported since theirs, labelled as a run's: information, never instructions.

### The sites a run reaches

- **Its hosts only.** A run reaches the hosts listed on its task and what is under them, over https, for that run only. « www.x » is that site, with or without its www, not every host under x. A task proposed in a conversation names one site, never a whole hosting service or a public suffix (github.io, asso.fr), nor free.fr, ovh.net or wordpress.com, which the list leaves out.
- **Its own browser.** It browses in a view and a session of its own, emptied before and after each run: it never has the user's sign-ins, and the user's page waits aside. Its browser stays out of sight.
- **Guarded before anything leaves** (`browser/run-guard.ts`): a link, a form, a script, a frame or a server's redirect elsewhere is stopped; a popup opens only on those hosts; nothing downloads, and nothing goes to the system (mail, phone). The tools check again where the page landed.
- **Not the folder's consents, nor the user's permissions.** It neither reads nor adds to the folder's consents: those were given to a conversation. Neither the level nor a standing permission applies to it (`main/approvals.ts` checks it again).
- **Bound to its run.** Each call keeps to the run it started in. A call the run outlives (the user's message stopped it while a page loaded) stops, rather than go on as a conversation's.

### What comes back

A task's folder wakes by its run, not by its date.

- A run that found nothing leaves the folder asleep (awake if the user hadn't read what it held), and folds with the others into one line of the conversation.
- Anything else wakes the folder and notifies the user. « à faire » lists the tasks that wait or failed, and those that found something they offer to follow up, until the user has opened them.
- A task's folder the user has read goes back to sleep after a day; a paused task's folder goes to "Classés".
- **A follow-up.** A service's task may offer one (its template's `followUp`, kept on the task: [services.md](services.md#planned-tasks)): on the line of the last run, when it reported it found something, a button with its label (« payer maintenant »), and « à faire » opens the folder there. A click is a turn of the conversation, the user's, attended (`chat.followUp`): their message reads as the label, and the engine reads the instruction the task kept, framed as their request. Never anything the run wrote, which reaches the engine as a run's report: information, never instructions. The click is also the user's go-ahead for that turn: going to the task's sites and filling forms on its service's declared sites need no card ([above](#tools-cards-and-the-browser)), but at « tout demander »; standing permissions and the floor apply as in any turn, so paying takes the payment card, the one confirmation of a toll's payment at « équilibré » and « autonomie ». Not for a task that is paused, whose service is off or that it no longer proposes (the window gets each task with whether it is still offered, as the main process checks it), nor for an older run's line; once started from a line, that line offers it no more, unless that answer failed or was stopped (an error, the user, the lock). The run itself is unchanged: it looks and reports.
- **Kept up to date.** At each check of the scheduler, before anything runs, a service's task takes from its template what an update of the service may have changed: its follow-up, its instruction, what it allows and what it never does. Never its sites: what its runs reach stays what the user saw on its sheet, and a template that lists others is said in the log.

### Where a task comes from

Nothing runs without the user's yes, given:

- on a sheet built from what a service proposes (`tasks()`, built-in services only: see [services.md](services.md));
- for a reminder of their own;
- or on a card, when Marianne proposes one in a conversation (`task_propose`). The card shows the instruction word for word, and the task keeps showing it, so the user can always read what comes back.
  - When a service that is on proposes that task, Marianne names it (the service, the template's id, a rhythm among its own) and nothing else: the task is the one the sheet would plan (`offeredTemplate`, `templateTask` in `main/tasks.ts`, the sheet's path too), and its card shows what the sheet shows. It comes back in the calling folder, or in a new one when that folder already has its task. A template already planned, or of a service that isn't on, is not offered.

A task's sites and instruction come from the service or from that card, never from the window, nor from the engine for a service's task.

## Public information

- **Connexions**: the public sources Marianne uses (`shared/public.ts`): Service-Public, indexed offline; Légifrance, with the user's API key; the Code du travail numérique; data.gouv.fr; the companies directory; communes and addresses; public holidays; OpenFisca. Each can be turned off in Réglages › Données publiques, and its address (`url`, in `~/.marianne/config.json`) can point elsewhere.
- **Content**: the public sites, the news sources and the yearly dates of the official calendar come from the content ([content.md](content.md)), built in, and replaced by a newer bundle when the project publishes one it signed.

### 3615 INFOS

The news is a service (`services/infos`); `ctx.news` hands it to the services that declare `news` ([services.md](services.md#news)).

- **No outlet learns what the user reads.** Marianne reads every source of the content's list, whatever the user chose. INFOS reaches no site itself.
- **What it keeps**: 7 days of titles, grouped into subjects (the titles of different sources that say the same thing).
- **What it shows**: the title, the time, the link and the feed's summary. For the one title a subject shows, the start of the article: 600 characters at most, read on demand, never past a paywall. The article opens at the source.
- **The user's sources are sensitive**, like their leaning: a profile field (`opinions.sources`, Réglages › Identité › sources d'information), never ticked in advance, never given to the engines, shared service by service.
- **Colours place, never rank.** Each source's colour is its editorial line, Marianne's by default or the user's own. Colours place the sources from left to right (`byLean`); they never rank the news, hide or pick a source.

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

Three kinds of packages:

- `apps/`: what ships;
- `packages/`: the libraries the app and the services import;
- `services/`: the add-ons built on the SDK, each with its manifest.

A folder becomes a package when something other than the app needs it (the SDK: the services; the content: the review and the bundles; each service), or when it is a boundary worth holding on its own. The archive (the user's data at rest) and the profile (where identifiers become tokens) are small, free of Electron, and can be read and tested without the app around them. The app's other modules stay in the app; the engines and the tools would become packages once something else needs them.

What may import what:

```
apps/desktop      any package, any service
services/<code>   @marianne/sdk only
content           @marianne/sdk
profile           @marianne/sdk, @marianne/content
archive, sdk      nothing of Marianne
```

- A package imports another by its name, never by a path.
- Only the apps run on Electron.
- In `packages/`, React is for the SDK's views only.

`scripts/check-boundaries.mjs` holds these rules, in `npm run check` and in CI: a new package gets its line there.

`npm run check` runs, in order:

1. Prettier;
2. a check that no `.gitkeep` is left beside other files;
3. a check that no `<placeholder>` stands outside code in Markdown (renderers drop it as an HTML tag);
4. the package boundaries;
5. the type checks: the app, then every package and service;
6. the tests: the app's, every package's and every service's.
