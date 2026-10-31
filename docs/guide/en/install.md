# Installing Marianne

Three steps, once and for all: install an AI engine, install Marianne, then connect the engine to your account. Allow a quarter of an hour.

## Before you start: an engine

Marianne has no AI of its own: it puts an AI engine to work, with your account at its maker. That engine is a **command-line** program (a "CLI"): it installs on your computer and works without a window of its own. That program is what you need to install.

The maker's desktop app or website (Claude, ChatGPT, Codex, Vibe) **is not enough**: Marianne doesn't use them, even when they contain an engine. They aren't needed either: keep them if you like, Marianne doesn't depend on them.

Choose an engine according to the account you have:

- **Claude Code**, by Anthropic: the `claude` program. It needs a Claude Pro, Max, Ultra, Team or Enterprise plan, or a Claude Console account, paid as you go. The free Claude plan doesn't include Claude Code. The official page: [code.claude.com/docs/en/setup](https://code.claude.com/docs/en/setup).
- **Codex CLI**, by OpenAI: the `codex` program. It needs a ChatGPT Plus plan or higher, or an OpenAI API key: with the Free and Go plans, Codex is only in the ChatGPT app, not on the command line. The official page: [learn.chatgpt.com/docs/codex/cli](https://learn.chatgpt.com/docs/codex/cli).
- **Mistral Vibe**, by Mistral AI: the `vibe` program. It works with a Mistral account, free (a few sessions) or Pro. It hasn't been tried with a real installation yet. The official page: [docs.mistral.ai/vibe/code/cli/install-setup](https://docs.mistral.ai/vibe/code/cli/install-setup).

The engine works with your account at its maker: your subscription, their terms. Without an engine, Marianne opens, but can't answer.

## Installing the engine

One line to copy into a terminal, the window where you type commands. You don't need to be an administrator, or to know how to code.

1. **Open a terminal.**
   - Windows: open the Start menu, type `powershell`, then Enter. In the window that opens, the line starts with `PS C:\Users\…>`.
   - macOS: cmd+space, type `terminal`, then Enter.
   - Linux: ctrl+alt+T, on most systems.
2. **Copy the line** for your engine and your system, below.
3. **Paste it** into the terminal (right-click or ctrl+V on Windows, cmd+V on macOS, ctrl+shift+V on Linux), then press Enter.
4. **Wait** for the terminal to hand back: a new line appears, ready for another command. It takes a minute or two; Claude Code shows nothing while it downloads, that's normal.
5. **Close the terminal.**

The engine installs in your home folder, for you alone. If the terminal shows an error in red, your engine's official page, above, says what to do.

### Claude Code

Windows:

```powershell
irm https://claude.ai/install.ps1 | iex
```

macOS and Linux:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

It then updates itself. For a first time in a terminal, Anthropic has [a terminal guide](https://code.claude.com/docs/en/terminal-guide), and [installation troubleshooting](https://code.claude.com/docs/en/troubleshoot-install).

### Codex

Windows:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

macOS and Linux:

```sh
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

The same line updates it.

### Mistral Vibe

macOS and Linux:

```sh
curl -LsSf https://mistral.ai/vibe/install.sh | bash
```

Windows, in two steps. First uv, the tool that installs Vibe:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Then close the terminal, open a new one, and paste:

```powershell
uv tool install mistral-vibe
```

Mistral targets macOS and Linux first; Vibe works on Windows too.

## Downloading Marianne

Download the file for your system at the bottom of the [releases page](https://github.com/rodolphebarbanneau/marianne/releases).

- **Windows**: `Marianne-Setup-….exe`. The program isn't signed yet: Windows shows "Windows protected your PC". Click "More info", then "Run anyway".
- **macOS**: the `.dmg` for your chip (`arm64` for Apple silicon, `x64` for Intel). The app isn't notarized: on first launch, right-click › Open, or System Settings › Privacy & Security › "Open Anyway".
- **Linux**: the `.deb`, or the `AppImage` (make it executable: `chmod +x`).

## Connecting the engine

Open Marianne and create your archive ([Getting started](getting-started.md)). Then open Réglages › Moteurs (Settings › Engines); the engines' lights, at the bottom left, lead there too with a click. Each engine shows its state there:

- **« introuvable sur cet ordinateur »** (not found on this computer): it isn't installed, or Marianne was already open during the installation. Click « réessayer » (try again). If it still isn't found, go back to [its installation](#installing-the-engine).
- **« pas connecté »** (not signed in): click « se connecter » (sign in). Marianne opens a terminal where the engine starts its own sign-in, with nothing to type: your browser opens at the maker's, where you sign in with your account. For Codex, choose "Sign in with ChatGPT"; for Vibe, "Launch browser", with the arrow keys then Enter. When the browser says it's done, close the terminal and reopen Réglages › Moteurs.
- **« connecté · prêt »** (signed in · ready): you're done, Marianne can answer you.

**An API key on your computer.** If a variable such as `ANTHROPIC_API_KEY`, `CODEX_API_KEY` or `MISTRAL_API_KEY` is set there, the engine would take it ahead of your sign-in, and an API key is billed per use, on top of your subscription. When the engine has your sign-in, Marianne leaves the key out and says so under the engine; the box « utiliser la clé de la variable… » (use the variable's key) takes it anyway. Without a sign-in, Marianne goes through the key, and says so too.

You sign in at the maker's, never in Marianne: it sees neither your password nor your sign-in, which the engine keeps in its folder (`.claude`, `.codex` or `.vibe`, in your home folder). You can also sign in without Marianne: type `claude`, `codex` or `vibe` in a new terminal and follow what it asks.

## Updates

On Windows and Linux, the next versions of Marianne install themselves (Réglages › À propos et mises à jour, Settings › About and updates). On macOS, since the app isn't signed yet, automatic updates don't work: download the new version from the releases page.

## Opening an archive with a double click

Once Marianne is installed, a `.marianne` file opens in Marianne with a double click. On macOS, first move the app to the Applications folder and open it once. On Linux, this works with the `.deb`, not with the `AppImage`.
