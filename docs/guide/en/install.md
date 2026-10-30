# Installing Marianne

## Before you start: an engine

Marianne has no AI of its own: it works with an AI engine, perhaps one you already have with your subscription. It uses the engine's terminal version: install it, even if you already have the engine's app.

- **Claude Code**, by Anthropic: [claude.com/product/claude-code](https://claude.com/product/claude-code). It comes with the paid Claude plans (Pro, Max, Ultra, Team, Enterprise), and also works with a Claude Console account.
- **Codex**, by OpenAI: [chatgpt.com/codex](https://chatgpt.com/codex). Codex is part of ChatGPT: it is included in your ChatGPT plan, with limits that depend on the plan, and you sign in to it with your ChatGPT account.
- **Mistral Vibe**, by Mistral AI: [mistral.ai/products/vibe](https://mistral.ai/products/vibe). Vibe, formerly Le Chat, has a coding agent for the terminal, included in your Mistral plan, Free or Pro, with limits that depend on the plan. It hasn't been tried with a real installation yet.

The engine works with your account at its maker: your subscription, their terms. Without an engine, Marianne opens, but can't answer.

### Installing it

Open a terminal (PowerShell on Windows, Terminal on macOS) and paste your engine's line. Each one's page gives the up-to-date line.

- **Claude Code**: `curl -fsSL https://claude.ai/install.sh | bash` on macOS and Linux, `irm https://claude.ai/install.ps1 | iex` on Windows.
- **Codex**: `curl -fsSL https://chatgpt.com/codex/install.sh | sh` on macOS and Linux, `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"` on Windows.
- **Mistral Vibe**: `curl -LsSf https://mistral.ai/vibe/install.sh | bash` on macOS and Linux. On Windows, first install uv with `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`, then Vibe with `uv tool install mistral-vibe`.

### Signing in

Once, type `claude`, `codex` or `vibe` in a new terminal and follow what it asks: your browser opens for you to sign in with your account (for Codex, "Sign in with ChatGPT"). After that, Réglages › Moteurs (Settings › Engines) shows the engines Marianne finds on your computer; when one isn't signed in, « se connecter » (sign in) opens its sign-in in a terminal.

## Downloading

Download the file for your system at the bottom of the [releases page](https://github.com/rodolphebarbanneau/marianne/releases).

- **Windows**: `Marianne-Setup-….exe`. The program isn't signed yet: Windows shows "Windows protected your PC". Click "More info", then "Run anyway".
- **macOS**: the `.dmg` for your chip (`arm64` for Apple silicon, `x64` for Intel). The app isn't notarized: on first launch, right-click › Open, or System Settings › Privacy & Security › "Open Anyway".
- **Linux**: the `.deb`, or the `AppImage` (make it executable: `chmod +x`).

## Updates

On Windows and Linux, the next versions install themselves (Réglages › À propos et mises à jour, Settings › About and updates). On macOS, since the app isn't signed yet, automatic updates don't work: download the new version from the releases page.

## Opening an archive with a double click

Once Marianne is installed, a `.marianne` file opens in Marianne with a double click. On macOS, first move the app to the Applications folder and open it once. On Linux, this works with the `.deb`, not with the `AppImage`.
