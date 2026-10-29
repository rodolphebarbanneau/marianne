# Installing Marianne

## Before you start: an engine

Marianne talks to an AI engine you already have. Install one, then sign in once with your account, in a terminal:

- **Claude Code**: [claude.com/product/claude-code](https://claude.com/product/claude-code)
- **Codex**: [github.com/openai/codex](https://github.com/openai/codex)
- **Mistral Vibe**: [docs.mistral.ai/vibe](https://docs.mistral.ai/vibe/) (not yet tried with a real installation)

The engine works with your account at its maker, Anthropic, OpenAI or Mistral: your subscription, their terms. Without an engine, Marianne opens, but can't answer. Réglages › Moteurs (Settings › Engines) shows the ones it finds on your computer.

## Downloading

Download the file for your system at the bottom of the [releases page](https://github.com/rodolphebarbanneau/marianne/releases).

- **Windows**: `Marianne-Setup-….exe`. The program isn't signed yet: Windows shows "Windows protected your PC". Click "More info", then "Run anyway".
- **macOS**: the `.dmg` for your chip (`arm64` for Apple silicon, `x64` for Intel). The app isn't notarized: on first launch, right-click › Open, or System Settings › Privacy & Security › "Open Anyway".
- **Linux**: the `.deb`, or the `AppImage` (make it executable: `chmod +x`).

## Updates

On Windows and Linux, the next versions install themselves (Réglages › À propos et mises à jour, Settings › About and updates). On macOS, since the app isn't signed yet, automatic updates don't work: download the new version from the releases page.

## Opening an archive with a double click

Once Marianne is installed, a `.marianne` file opens in Marianne with a double click. On macOS, first move the app to the Applications folder and open it once. On Linux, this works with the `.deb`, not with the `AppImage`.
