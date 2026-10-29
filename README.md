# Marianne

A desktop citizen assistant for people living in France: rights, formalities, papers and deadlines, public information. It works with your own Claude Code, Codex or Mistral Vibe, through its own tools only, and keeps everything in one encrypted archive on your computer.

**Status: alpha.** To install and use it, see the user guide, in [English](docs/guide/en/index.md) or in [French](docs/guide/fr/index.md), and the [releases](https://github.com/rodolphebarbanneau/marianne/releases). Marianne is an independent project, not affiliated with the French State or any administration.

- [User guide](docs/guide/README.md): installing and using Marianne, in French and in English, the same pages in each.
- [Design](docs/design.md): the window, folders, the archive and its security, engines, tools.
- [Services](docs/services.md): the 3615 add-ons and their SDK.
- [Content](docs/content.md): skills, guided démarches, the calendar, sites and news sources; how to contribute, and how signed updates reach the app.

## Development

Node 24 and npm. The repository is an npm workspace: the app in `apps/desktop`, `packages/sdk`, the services in `services/` and the content in `content/`. The root holds only the workspace and its tools; its scripts run the app's.

```sh
npm install             # installs and links the workspace packages
npm run dev             # the app; the window reloads live, the main process restarts on change
npm run check           # Prettier, no stray .gitkeep, type checks and tests (app and packages)
npm run build           # apps/desktop/out/
npm run dist            # installers, in apps/desktop/dist/
npm run content:bundle  # the content bundle, in content/dist/ (signed: docs/content.md)
```

Marianne keeps this computer's data in `~/.marianne` (`MARIANNE_HOME` moves it); accounts are `.marianne` archives in the folder you choose.

## Contributing

Contributions are welcome, in English: bugs, ideas, content corrections, services and code. See [CONTRIBUTING.md](CONTRIBUTING.md), and the [code of conduct](CODE_OF_CONDUCT.md). Security issues are reported privately: see [SECURITY.md](SECURITY.md).

## License

MIT
