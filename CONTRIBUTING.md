# Contributing to Marianne

Thanks for your interest in Marianne. It's a desktop citizen assistant for people living in France, built in the open so that anyone can follow it, check it and improve it. Everything on GitHub (issues, pull requests, reviews, docs) is in English, so that an international community can take part. The app itself speaks French to its users.

Please read the [code of conduct](CODE_OF_CONDUCT.md) first. To report a security issue, don't open an issue: see the [security policy](SECURITY.md).

## Ways to help

- **Report a bug, suggest an idea, share feedback**: [open an issue](https://github.com/rodolphebarbanneau/marianne/issues/new/choose) on one of its forms.
- **Correct the content**: a guided démarche, a skill, a calendar date, a public site or a news source that is wrong or outdated. Use the "Content correction" form, or send a pull request (see [docs/content.md](docs/content.md)).
- **Propose a news source** for 3615 INFOS, with the same form: a newsroom writing in French, with an open feed that works (RSS or Atom, carrying its articles).
- **Write a service**: the 3615 add-ons are packages built on `@marianne/sdk`: the contract in [docs/services.md](docs/services.md), how to build one well in [services/AGENTS.md](services/AGENTS.md).
- **Improve or translate the user guide**: it lives in `docs/guide/<language>/`, every language with the same English file names (see [docs/guide](docs/guide/README.md)). A change to one page goes to every language in the same pull request.
- **Improve the code**: start with an issue, ideally one labeled `good first issue` or `help wanted`, and say you're on it.

Never put personal data in an issue, a pull request, a test or a screenshot: social security numbers, tax numbers, addresses, IBANs, real names. Everything here is public.

## Setting up

Node 24 and npm. From the repository's root:

```sh
npm install     # installs and links the workspace packages
npm run dev     # the app; the window reloads live, the main process restarts on change
npm run check   # Prettier, no stray .gitkeep, package boundaries, type checks and tests
```

The repository is an npm workspace: the app in `apps/desktop`, its packages in `packages/` (the SDK, the archive, the profile, the content) and the services in `services/`. See the [README](README.md) and [docs/design.md](docs/design.md) for how it fits together.

Working with an AI agent? [AGENTS.md](AGENTS.md) gives it the map of the repository, the checks and these rules, and [services/AGENTS.md](services/AGENTS.md) how to build a service.

## The rules of the code

- **English for code, French for the interface.** Identifiers, comments, commit messages, tool names and anything an engine reads are in English. Everything the user reads in the app is in French.
- **Privacy is the design, not a feature.** Personal information never goes to a server of the project's: there is none. Identifiers reach the engines only as `[[tokens]]`, put back on the user's screen only. Anything that changes the profile, fills a form, signs, pays or sends goes through the user's approval. A change that weakens one of these won't be merged.
- **Formatting is Prettier's** (`npm run format`): no semicolons, single quotes, lines up to 160 characters.
- **Comments say why**, in full sentences, at the density of the code around them.
- **Tests come with the change**, with vitest, next to the code they cover (`test/` in each package).

## Pull requests

1. Branch from `main`, and keep a pull request to one subject.
2. Run `npm run check` before pushing.
3. Open the pull request with the template that fits: the default one for code (what changes and why, how you tested it, screenshots for anything visible), or one of [`.github/PULL_REQUEST_TEMPLATE/`](.github/PULL_REQUEST_TEMPLATE) for a new service (`new-service.md`), content (`content.md`), or the user guide and the docs (`guide.md`). GitHub fills in the default one; for another, add `&template=new-service.md` to the address of the page that opens the pull request, or run `gh pr create --template new-service.md`.
4. CI must pass: the checks, the site's check and build, and a package build on Windows, macOS and Linux.
5. Pull requests are merged by rebase, so `main` stays a straight line of commits. Write commit messages as short, plain sentences ("Give the profile's archive tests 30 seconds"), with details in the body when they help.

Content changes are reviewed with extra care: skills go into the engines' instructions, and démarches are legal guidance people will act on. Cite an official source (Légifrance, service-public.fr, the administration concerned) for anything you add or change; for a news source, its feed.

## Releases

Releases are tagged `v*` from `main` by the maintainer: the tag builds the installers into a draft release, which the maintainer then publishes. Their notes are written in English, with a link to the [user guide](docs/guide/README.md), in English and in French. GitHub groups the generated notes by label (`.github/release.yml`). Publishing a release rebuilds the website ([`site/`](site/README.md#publishing)).

## License

Marianne is under the [MIT license](LICENSE). By contributing, you agree that your contribution is licensed under it too.
