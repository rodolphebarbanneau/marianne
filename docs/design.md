# Marianne: personal file, domains and agent (design)

Status: agreed design, not yet implemented. Decisions taken with the product owner on 2026-10-28.

## Goal

Make the **person** the entry point. One individual (and their household) finds, in one place, their identity, the entities linked to them (companies, employers, vehicles, properties), and everything they deal with in each domain of the State, with clear flows, deadlines that come to them, and a chat that can move around the app and do the work with them.

## Decisions

| Topic         | Decision                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | One person per install, with household members (spouse, children) inside the file                                                                                                                                      |
| Privacy       | The AI sees **context only** (age, commune, household, work situation). Identifiers never leave the computer: the AI uses `[[tokens]]` that the app fills in locally                                                   |
| Agent actions | Navigates the app, updates the file, adds deadlines and documents, drafts letters, **and fills forms on government sites** in the built-in browser, always after confirmation; never passwords, never the final submit |
| Domains       | 10 domain pages (below)                                                                                                                                                                                                |
| Entities      | Companies, employers, vehicles, properties                                                                                                                                                                             |
| Documents     | Encrypted vault (file and documents encrypted at rest, key held by the OS keystore)                                                                                                                                    |
| Reminders     | Starts with the system, lives in the tray, OS notifications before each deadline                                                                                                                                       |
| Chat          | A side panel available on every page, aware of the page, able to navigate                                                                                                                                              |
| Defaults      | Guided onboarding form (or by chat, or from a document); the Assemblée moves into _Identité & citoyenneté_; encrypted backup export protected by a passphrase                                                          |

## Information architecture

```
3615 MARIANNE                                            [ dialogue ◧ ] [ réglages ]
┌──────────────────────┬──────────────────────────────────────────┬──────────────────┐
│ 0  MOI               │  page                                    │  dialogue        │
│ 1  identité          │                                          │  (side panel,    │
│ 2  santé             │                                          │   toggled from   │
│ 3  impôts            │                                          │   any page)      │
│ 4  famille           │                                          │                  │
│ 5  travail           │                                          │                  │
│ 6  retraite          │                                          │                  │
│ 7  logement          │                                          │                  │
│ 8  justice           │                                          │                  │
│ 9  entreprises       │                                          │                  │
│ 10 mobilité          │                                          │                  │
├──────────────────────┴──────────────────────────────────────────┴──────────────────┤
│ C  status · function keys                                                          │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Moi (home)

- Identity card: names, birth date and place, NIR (masked), nationality, family situation.
- Address (normalized with the national address base: INSEE code, coordinates; it drives local offices, the deputy, benefit rules).
- Household: spouse and children (needed for taxes and benefits).
- Linked entities: companies, employers, vehicles, properties.
- Dashboard: upcoming deadlines across domains, alerts (a document expiring, a declaration due), recent activity.

### The 10 domains

| #   | Domain                 | Organizations and content                                               |
| --- | ---------------------- | ----------------------------------------------------------------------- |
| 1   | Identité & citoyenneté | ID papers (ANTS), civil status, elections, vie démocratique (Assemblée) |
| 2   | Santé                  | Assurance maladie (ameli, CPAM), CSS, Mon espace santé, MDPH            |
| 3   | Impôts & finances      | Income tax, withholding, property tax, payment schedules                |
| 4   | Famille & solidarités  | CAF / MSA, family allowances, housing aid, RSA, prime d'activité        |
| 5   | Travail & emploi       | Contracts, employers, France Travail, CPF                               |
| 6   | Retraite               | Career record, pension schemes                                          |
| 7   | Logement               | Lease, aid, renovation, risks at the address                            |
| 8   | Justice & litiges      | Appeals, deadlines, procedures, consumer disputes                       |
| 9   | Entreprises & activité | Linked companies, URSSAF, VAT, CFE, INPI formalities                    |
| 10  | Mobilité               | Licence, vehicles, fines, Crit'Air                                      |

Every domain page has the same anatomy:

1. **À faire**: this domain's deadlines and alerts.
2. **Mes comptes**: the organizations' sites, with keychain status and one-click login in the built-in browser.
3. **Mes informations**: the identifiers and entities relevant here (masked identifiers, e.g. NIR `••• •• 12`).
4. **Démarches**: guided procedures (checklists the user and the agent go through).
5. **Documents**: this domain's encrypted documents; dropping one offers an extraction.
6. **Comprendre**: the Service-Public dossiers of the theme, benefit estimates where relevant.
7. **Demander à Marianne**: opens the panel with the domain's starters.

A domain is defined as data (label, Minitel code and color, organizations from the site catalog, Service-Public themes, relevant tools and skills, deadline rules), so adding or reshaping one doesn't touch the UI code.

## The personal file

There is no API through which a citizen's own administrative data can reach a third-party app: API Particulier, Impôt particulier and FranceConnect data access are reserved to public bodies. The file is filled by the user, by reading documents they add, and by reading pages they send from the built-in browser. Every extraction is shown for confirmation before it is saved.

```
dossier
  personne     civilité, nom de naissance, nom d'usage, prénoms, date et lieu de naissance (commune, code insee, pays),
               nationalité, nir, situation familiale, téléphone, courriel
  adresse      libellé, code postal, commune, code insee, coordonnées, depuis
  foyer[]      lien (conjoint, enfant, autre), prénom, nom, date de naissance, à charge
  identifiants[]  domaine, organisme, libellé, valeur, jeton          e.g. numéro fiscal, numéro allocataire
  pieces[]     type (cni, passeport, permis, titre de séjour), numéro, délivrance, expiration, titulaire
  entites
    entreprises[]  siren, dénomination, forme, rôle, depuis, régime (micro, ei, société), périodicité urssaf, tva, clôture
    employeurs[]   siren, nom, début, fin, contrat, convention collective (idcc)
    vehicules[]    immatriculation, modèle, mise en circulation, dernier contrôle technique, crit'air
    biens[]        adresse, statut (locataire, propriétaire), bail (début, loyer, bailleur), parcelle, taxe foncière
  echeances[]  domaine, titre, date, source (règle, calendrier officiel, utilisateur, agent), entité, statut, rappels
  documents[]  domaine, titre, type, date, entité, fichier chiffré, champs extraits
  journal[]    date, domaine, action, détail       history of what was done and sent
  demarches{}  progress of guided procedures
```

### Storage and encryption

- A random 256-bit data key, wrapped by the OS keystore (Electron `safeStorage`), in `~/.marianne/keys.json`.
- The file: `dossier.enc`, AES-256-GCM. Documents: `documents/<id>.bin`, AES-256-GCM, one IV each.
- Decrypted only in the main process: to display, to fill a form, or to give a document to the agent.
- Encrypted export protected by a passphrase (scrypt), to move to another computer or recover after a reinstall.
- Linux without a keyring: the existing "weak" warning applies to the whole vault.

## Privacy layer: tokens and redaction

The AI works on **context** and **tokens**, never on identifiers:

- The `dossier` tool returns context (age, commune, household ages, work situation, entity kinds and activities) and the list of available tokens: `[[nom]]`, `[[prenoms]]`, `[[adresse]]`, `[[nir]]`, `[[numero_fiscal]]`, `[[numero_allocataire]]`, `[[iban]]`, `[[entreprise.1.siren]]`…
- **On the way in**: tokens in tool arguments are replaced with real values inside the app's MCP server (e.g. a company lookup by `[[entreprise.1.siren]]`).
- **On the way out**: tool results, pages sent from the browser and document texts are scrubbed. Every known identifier value is replaced by its token before reaching the agent.
- **Display**: the chat, letters and exports show real values, substituted locally.
- Documents given to the agent are converted to text by the app (PDF text extraction) and scrubbed. A scanned image can't be scrubbed: the app asks for explicit confirmation before sending it.

## The agent as operator

New tools on Marianne's MCP server:

| Tool                     | Does                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `dossier`                | Context view of the file and the available tokens                                                                 |
| `afficher`               | Navigates the app: a page, an entity, a procedure                                                                 |
| `proposer`               | Proposes a change to the file: add or update an identifier, an entity, a deadline, a document's metadata, a field |
| `echeances`              | Deadlines by domain and period                                                                                    |
| `demarches` / `demarche` | Guided procedures of a domain, and one procedure with its progress                                                |
| `lire_document`          | Text of a document from the vault, scrubbed                                                                       |
| `entreprises_liees`      | Companies where the person is a director or sole trader, from the identity (server-side)                          |
| `lire_formulaire`        | Fields of the form shown in the built-in browser (labels, types, current values, scrubbed)                        |
| `remplir_formulaire`     | Fills those fields, with tokens resolved locally                                                                  |

**Confirmation cards.** `proposer` and `remplir_formulaire` don't act directly: the MCP call waits while the chat shows a card (each field and its real value, [accepter] [modifier] [refuser]), and returns the user's decision to the agent. The CLIs' MCP timeouts are raised accordingly (`MCP_TOOL_TIMEOUT` for Claude Code, `tool_timeout_sec` for Codex). Form filling never touches password fields and never clicks submit. It acts only on the current page of the built-in browser, in frames of the same site.

**Page awareness.** Each message carries the page the user is on (`<page id="sante" />`); domain pages offer starters that open the panel with the right context.

## Deadlines

Three sources feed one list:

1. **Rules** computed from the file. Examples:
   - micro-entreprise URSSAF declarations (monthly or quarterly), the CFE;
   - companies' accounts approval and filing, and VAT;
   - vehicle technical inspection;
   - ID document expiry;
   - quarterly benefit declarations (RSA, prime d'activité).
2. **Official yearly dates** that can't be computed (income tax deadlines by département, property tax). They come from a `calendrier/<année>.json` kept in the repository: fetched from GitHub so it updates without a release, with a bundled fallback.
3. **Items added** by the user or proposed by the agent (from a letter: "répondre avant le…", computed with `calcul_delai`).

The app starts at login (`setLoginItemSettings`, hidden), lives in the tray (deadline count), checks daily, and notifies 30 days, 7 days and the day before.

## Linked entities

- **Companies:** discovered from the identity with `recherche-entreprises` (name, first names and birth month; verified to return the companies where the person is a director, with the role); the user confirms which are theirs. The INPI national registry (free account, credentials in the keychain) adds deeds and filings; Infogreffe is linked (paid API). The company's legal form and tax regime set its deadline rules.
- **Employers:** entered or extracted from payslips and contracts; the collective agreement (IDCC) links to the Code du travail numérique.
- **Vehicles:** registration and dates; technical inspection rules; ANTS and fines.
- **Properties:** home and other property; lease or ownership; risks (Géorisques) and cadastre at the address.

## Guided procedures

Data, like skills: `resources/demarches/<domaine>/<id>.md`, with a front matter (title, domain, when, duration, documents needed) and numbered steps. A step can carry actions: open a site (with login), add a document, ask the agent, fill a form. They are rendered as a checklist, their progress is kept in the file, and the agent can start them and work through them with the user.

## Phasing

| Lot | Content                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Stabilize the current app (in progress)                                                                                                                                                                    |
| 1   | Encrypted vault, personal file and onboarding, Moi page, token and redaction layer, new navigation with the 10 domain pages (comptes, informations, comprendre), chat side panel, `dossier` and `afficher` |
| 2   | Linked entities (4 kinds), company discovery and INPI, entity pages, confirmation cards and `proposer`                                                                                                     |
| 3   | Deadlines (rules, official calendar, agent), tray, start at login, notifications; documents vault UI with extraction                                                                                       |
| 4   | Guided procedures, form filling in the built-in browser, activity journal, encrypted backup export                                                                                                         |

## Risks

- **Identifier leaks** through paths that bypass the scrubbing (the agent's own file reading, web search queries). Mitigation: documents only reach the agent as scrubbed text through `lire_document`. The `Read` tool is limited to files the user explicitly attaches. The system prompt forbids putting tokens in web queries.
- **Keystore loss** (OS reinstall, profile change) makes the vault unreadable. Mitigation: passphrase-protected export, reminded after onboarding.
- **Official sites changing** their forms or URLs breaks form filling. It works from the live page each time (labels, not fixed selectors), and nothing is ever submitted automatically.
- **Calendar accuracy**: official dates are maintained data with a source link for each entry, and the agent cross-checks with Service-Public.
