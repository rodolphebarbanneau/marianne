# Content

Marianne's content is what it knows that anyone may improve:

- the engines' skills;
- the guided démarches;
- the official calendar;
- the catalog of public sites;
- the news sources of 3615 INFOS;
- the parliamentary groups.

It lives in `packages/content/` (`@marianne/content`), ships built into the app, and is updated between releases as a bundle the project signs. Anyone may propose a change, **through review only**.

Review is not a formality. Skills go into the engines' instructions: a guide that says the wrong thing is a prompt injection. Démarches are legal guidance for people dealing with their administration. So every change is read by a maintainer, every claim has an official source, and the app only takes a bundle signed with the project's key.

Not content:

- the app's assets (`apps/desktop/resources/`: icons) and its core data: the domains and the profile (`packages/profile/`, `@marianne/profile`), the engines' instructions (`apps/desktop/src/main/engines/prompt.ts`);
- the services, the 3615 add-ons (see [services.md](services.md));
- the user's own skills, in `~/.marianne/skills`: local, unsigned, never published.

## The package

```
packages/content/
  skills/<name>.md                   method guides the engines read
  procedures/<domain>/<id>.md        guided démarches, one folder per domain
  calendar.json                      dates that come back every year
  sites.json                         the public-service websites
  news-sources.json                  the news sources and their feeds, read for 3615 INFOS
  parliament.json                    the political groups of both chambers, for the leaning
  signing-key.pem                    the project's public key, once it has one
  src/index.ts                       the formats, readContent and the bundle's text (pure)
  src/files.ts                       the files, as the app's build bundles them
  scripts/                           the signing key and the bundle (npm run content:key, content:bundle)
  test/                              every shipped file validated, and the format's tests
```

Names are English, lowercase words joined by hyphens (`declare-income`, `labor-law`); what people read is French. The domains are those of `DOMAIN_IDS` (`@marianne/sdk`): identity, family, health, taxes, work, retirement, housing, mobility, justice, business.

## Rules for every file

### Official sources

Every web address in the content (in a text, a source, a site or a link) is `https://` on an official site:

- any host under `gouv.fr`;
- or a domain of `OFFICIAL_DOMAINS` (`packages/content/src/index.ts`), or one of its subdomains: service-public.fr, ameli.fr, caf.fr, msa.fr, urssaf.fr, francetravail.fr, info-retraite.fr, lassuranceretraite.fr, agirc-arrco.fr, assemblee-nationale.fr, senat.fr, conseil-constitutionnel.fr, conseil-etat.fr, courdecassation.fr, defenseurdesdroits.fr, cnil.fr, insee.fr, justice.fr, telerecours.fr, inpi.fr, cnsa.fr, monespacesante.fr, demarches-simplifiees.fr, anil.org, vie-publique.fr.

Adding a domain to that list is a change to review on its own. The one exception is the news sources: press sites, which need only be https.

### Metadata

Skills and démarches say, in their front matter:

| key        | what                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sources`  | what the file is based on, at least one, separated by `;`: Service-Public ids (`F18509`, `N360`) or official https URLs        |
| `updated`  | the day of the last change (`YYYY-MM-DD`): bump it with every change                                                           |
| `owner`    | who maintains it: `marianne` for the project's own, or the contributor's GitHub handle                                         |
| `verified` | optional: the day a reviewer checked the file against its sources (`YYYY-MM-DD`), set by the reviewer only ([Review](#review)) |

- The front matter is one `key: value` per line, without quotes; lists are separated by `;`.
- Unknown keys are refused, so that a typo never goes unnoticed.
- The JSON files have an `updated` date at the top, and may have a `note` for contributors.

## Skills

`skills/<name>.md` is a guide the engines read before handling a kind of request. Its name is its file's. Write it in French, for the model: the method, the tools to call, the traps.

```markdown
---
name: taxes
title: Impôts
description: déclaration de revenus, avis d'impôt, prélèvement à la source, réductions et crédits, taxe foncière, réclamations
sources: https://www.impots.gouv.fr; https://bofip.impots.gouv.fr
updated: 2026-10-28
owner: marianne
---

# Impôts des particuliers

## Méthode

1. Identifie la question : montant de l'impôt, déduction ou crédit, avis contesté…
```

A skill tells the engine how to use Marianne's own tools. It never asks it to reach other sites, to reveal the user's identifiers, or to set its instructions aside.

## Guided démarches

`procedures/<domain>/<id>.md` is a formality, step by step. Its id is its file's name, unique across the domains; its `domain` is its folder's.

```markdown
---
id: contest-fine
domain: mobility
title: Contester une amende ou désigner le conducteur
description: avis de contravention, radar, stationnement
when: dans le délai indiqué sur l'avis (souvent 45 jours)
duration: 15 minutes
documents: l'avis de contravention; vos justificatifs
sources: F18509
updated: 2026-10-28
owner: marianne
---

## Lire l'avis

Repérez la date d'envoi de l'avis et le délai pour contester.

> document: letter | Ajouter l'avis de contravention
> sheet: F18509 | Lire la fiche amende forfaitaire

## Faire la démarche en ligne

> open: antai | Ouvrir l'ANTAI
```

- `title` and `description` are required; `when`, `duration` and `documents` (what to have at hand, separated by `;`) are optional.
- A démarche has at least two steps, each a `## Title` then Markdown. Nothing comes before the first one.
- A step's actions are lines `> kind: target | label`; the label is the button's text.

| kind       | target                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`     | a site of `sites.json` by its id (`impots`), or an official https page: opened in the folder's browser                                                               |
| `setup`    | a setting the user fills in: `identity`, `address`, `household`, `id_documents`, `notes`, `companies`, `employers`, `vehicles`, `properties`, or `account:<site id>` |
| `document` | a pièce to add, by type: `tax_notice`, `certificate`, `payslip`, `statement`, `letter`, `contract`, `proof`, `other`                                                 |
| `ask`      | a question for Marianne, sent to the folder's conversation                                                                                                           |
| `sheet`    | a Service-Public document (`F358`)                                                                                                                                   |
| `service`  | a 3615 service by its code (`peage`): opened when it is on; otherwise the step says it is off and links to the settings                                              |

The folder that follows a démarche shows its steps and the actions of the step in progress. The engine reads the whole démarche through its `procedure` tool.

## The official calendar

`calendar.json` holds the dates that come back every year and can't be computed (income tax, property tax, CFE). Each one becomes a deadline for the users it applies to.

```json
{
  "id": "property-tax",
  "domain": "taxes",
  "title": "payer la taxe foncière (date limite habituelle : mi-octobre, quelques jours de plus en ligne)",
  "monthDay": "10-15",
  "applies": "owner",
  "indicative": true,
  "site": "impots",
  "source": "https://www.service-public.gouv.fr/particuliers/vosdroits/F59"
}
```

| key                 | what                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `applies`           | `always`, `owner` (owns a property) or `company` (has a company subject to it) |
| `indicative`        | the administration confirms the date each year                                 |
| `site`, `procedure` | a site and a démarche of the content                                           |
| `source`            | the official page that gives the date                                          |

## Public sites

`sites.json` lists the public-service websites people most often need, and how they sign in. The engines open them in the built-in browser and, in "public sites only" mode, may read them; the settings list them (Connexions › Sites et API).

```json
{
  "id": "caf",
  "name": "Caf",
  "url": "https://www.caf.fr",
  "domain": "family",
  "login": "account",
  "description": "allocations familiales, aides au logement, RSA, prime d’activité, simulateurs",
  "fields": [{ "key": "caf_number", "label": "numéro allocataire", "hint": "7 chiffres, sur vos courriers de la Caf", "pattern": "^[0-9]{7}$" }]
}
```

| key        | what                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login`    | `franceconnect`, `account` or `none`                                                                                                                             |
| `fields`   | the identifiers the site needs, kept in the user's profile. A field's `key` becomes the token the engines see (`[[caf_number]]`), so it belongs to one site only |
| `needsNir` | the site identifies its users by their social security number                                                                                                    |

## News sources

`news-sources.json` is the press Marianne reads for 3615 INFOS:

- the same list for everyone: no feed is added by hand;
- the user accepts or sets aside sources in Réglages › Identité, but Marianne reads every source whatever they chose;
- it shows what a feed shows (title, time, link, summary) and, for the one title a subject shows, the start of its article: never the whole article, never past a paywall.

```json
{
  "id": "le-monde",
  "name": "Le Monde",
  "group": "national",
  "feed": "https://www.lemonde.fr/rss/une.xml",
  "homepage": "https://www.lemonde.fr",
  "sections": [
    { "id": "une", "label": "à la une", "feed": "https://www.lemonde.fr/rss/une.xml" },
    { "id": "politique", "label": "politique", "feed": "https://www.lemonde.fr/politique/rss_full.xml" }
  ],
  "lean": "centre-gauche",
  "paywall": ".article__wrapper--premium"
}
```

| key        | what                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `group`    | `national`, `regional`, `broadcast` or `factcheck`                                                                                                                                                                  |
| `feed`     | the front page's feed, RSS 2.0 or Atom. It stays even with sections: older versions of the app read it alone                                                                                                        |
| `sections` | the source's feeds (below)                                                                                                                                                                                          |
| `regions`  | a regional source's area, as INSEE region codes (`53` Bretagne, `52` Pays de la Loire…): required for a `regional` source, refused for another                                                                      |
| `lean`     | Marianne's default editorial line (below); absent, `centre`                                                                                                                                                         |
| `paywall`  | for a source whose paid pages don't say so (`isAccessibleForFree` in their JSON-LD): a CSS selector found on its paid pages only. Nothing past the summary is read there. Check it on a paid page and on a free one |
| `start`    | `false` when the source asked that no start of its articles be shown: its summary alone                                                                                                                             |
| `dates`    | for a source whose feeds carry no dates: its news sitemap (below)                                                                                                                                                   |

**Sections.** The front page first (its feed is `feed`, its id usually `une`), then three to six useful ones (`politique`, `international`, `economie`…). Ids are lowercase words joined by hyphens, labels French and lowercase, each id and feed once. A user keeps all of them unless they untick some.

**Regions.** Without an address, every source is accepted. With one, the regional sources of other regions start set aside.

**Lean.** One of five positions: `gauche`, `centre-gauche`, `centre`, `centre-droit`, `droite`; the scale stops there.

- `centre` is a source with no clear lean, drawn in a neutral colour. The fact-checkers, which take no side, are `centre`.
- It is Marianne's classification: shown as the source's colour and its place from left to right, never used to rank the news or pick a source.
- The user may give any source another position in Réglages › Identité › sources d'information.

**Dates.** Le Parisien's feeds carry no dates, for instance. Give such a source its news sitemap (sitemaps.org with Google News' `publication_date`, as its `robots.txt` lists it): an undated title then takes its time, and its picture, from the sitemap. Without it, an undated title is dated when Marianne first sees it, and the whole feed would land in the hour of a first reading.

**Before proposing a source or a section**, check that each feed answers and carries recent articles. A source is a newsroom writing in French, with an open feed that works.

## Parliamentary groups

`parliament.json` lists the groups of the Assemblée nationale and of the Sénat, from left to right in each hemicycle. A user may say which one they lean to, in Réglages › Identité.

```json
{ "chamber": "an", "acronym": "EcoS", "name": "Écologiste et Social", "color": "#77aa79", "senate": "GEST" }
```

| key       | what                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chamber` | `an` or `se`                                                                                                                                            |
| `acronym` | the chamber's own, as its open data writes it: 3615 PARLEMENT compares votes by it                                                                      |
| `color`   | the chamber's, `#rrggbb` lowercase                                                                                                                      |
| `senate`  | for an Assemblée group, the Sénat group of its political family, proposed to the user when they pick it (theirs to change); left out when there is none |

Non-attached members are not a leaning: they are not listed. Update the file when a group is formed, renamed or dissolved.

## Checking a change

```sh
npx vitest run --project content   # every shipped file, and the format
npm run check                      # everything, before a pull request
```

- Content is used whole or not at all. `readContent` lists every problem it finds, each with its file and field: `procedures/mobility/contest-fine.md: step 2 "Faire la démarche en ligne": open: "antai2" is not a site of sites.json`.
- The app also refuses content whose démarches use a setting or a document type it doesn't know (`appProblems` in `apps/desktop/src/main/content/`), at start and for every bundle. `apps/desktop/test/content.test.ts` checks the shipped files against it.

## Review

Every change goes through a pull request, read by a maintainer. A domain's démarches are reviewed by maintainers who know it, hence one folder per domain. A reviewer checks:

- each claim of the change against its sources, which must be official and say what the text says;
- that a skill only tells the engine how to use Marianne's tools, and nothing that would set its instructions aside;
- the actions: the right site, setting, document type, sheet or service;
- a news source's feeds, that they answer, and its `lean`;
- `updated` bumped, and the `owner`.

`verified` records that a reviewer read the whole file against its sources:

- the reviewer sets it, to the day they did, in a pull request of their own or in a review commit; never the author of the change;
- a later change bumps `updated` and leaves `verified` as it was, so a `verified` older than `updated` means the last change has not been checked yet.

## Signed bundles

Between releases, newer content reaches the users as a bundle of two files:

- `content.json`: every file of the content by its path, and the bundle's `version` (the time it was built, ISO);
- `content.json.sig`: its ed25519 signature.

### The key

Made once: `npm run content:key -- <path outside the repository>`.

- **The private key** goes to that path; the script refuses one inside the repository. Whoever holds it can change what every Marianne tells its users: keep it offline or in a secret store.
- **The public key** goes to `packages/content/signing-key.pem`, to commit: the app is built with it. Without it, the app takes no bundle (it says so once in its log) and keeps the content it was built with.
- The script refuses to replace an existing public key: the apps already released only take bundles signed with theirs.

### A bundle

`MARIANNE_CONTENT_KEY=<private key> npm run content:bundle` writes `packages/content/dist/content.json` and `content.json.sig` beside it.

- The script refuses content that doesn't validate, and a key that is in the repository or doesn't match `signing-key.pem`.
- Without the variable, it builds an unsigned bundle, for a look.
- Attach both files to the latest GitHub release, replacing the previous ones, and attach a fresh pair to every new release: the app downloads the latest release's.

### How the app picks its content

In `apps/desktop/src/main/content/`:

- **At start**: the content it was built with, unless the bundle taken on an earlier run (`~/.marianne/content/`) still checks out. One that doesn't is removed, and the log says why.
- **30 seconds after start, then every day**: it asks for `https://github.com/rodolphebarbanneau/marianne/releases/latest/download/content.json` (a conditional request: nothing is downloaded when it didn't change), then its signature.
- **It takes a bundle** when its signature verifies with the built-in public key (nothing else of the file is read before that), its version is newer than the content in use, and every one of its files is valid for this version of Marianne. Otherwise it keeps what it has and logs why; a bundle it can't read whole is refused whole.
- **The built-in content** counts until the end of the day of its latest `updated`: a bundle built that same day is not newer.

The screens follow: sites, news sources, démarches and the calendar's deadlines come from the content in use.

### Changing the format

A new key or a new file is a change of the format: the versions before it refuse the bundles that carry it, whole, and keep the content they have until they are updated. So:

- make such a change with a release, never as a key that only some bundles carry;
- keep what older versions require (a news source's `feed`, every file of `CONTENT_FILES`).
