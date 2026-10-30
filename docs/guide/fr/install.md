# Installer Marianne

## Avant de commencer : un moteur

Marianne n’a pas d’IA à elle : elle travaille avec un moteur d’IA, celui que vous avez peut-être déjà avec votre abonnement. Elle en utilise la version pour le terminal : installez-la, même si vous avez déjà l’application du moteur.

- **Claude Code**, d’Anthropic : [claude.com/product/claude-code](https://claude.com/product/claude-code). Il est compris dans les abonnements Claude payants (Pro, Max, Ultra, Team, Enterprise), et marche aussi avec un compte Claude Console.
- **Codex**, d’OpenAI : [chatgpt.com/codex](https://chatgpt.com/codex). Codex fait partie de ChatGPT : il est compris dans votre offre ChatGPT, avec des limites selon l’offre, et vous vous y connectez avec votre compte ChatGPT.
- **Mistral Vibe**, de Mistral AI : [mistral.ai/products/vibe](https://mistral.ai/products/vibe). Vibe, l’ancien Le Chat, a un agent de code pour le terminal, compris dans votre offre Mistral, gratuite ou Pro, avec des limites selon l’offre. Il n’a pas encore été essayé avec une vraie installation.

Le moteur travaille avec votre compte chez son éditeur : votre abonnement, ses conditions. Sans moteur, Marianne s’ouvre, mais ne peut pas répondre.

### L’installer

Ouvrez un terminal (PowerShell sur Windows, Terminal sur macOS) et collez la ligne de votre moteur. La page de chacun donne la ligne à jour.

- **Claude Code** : `curl -fsSL https://claude.ai/install.sh | bash` sur macOS et Linux, `irm https://claude.ai/install.ps1 | iex` sur Windows.
- **Codex** : `curl -fsSL https://chatgpt.com/codex/install.sh | sh` sur macOS et Linux, `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"` sur Windows.
- **Mistral Vibe** : `curl -LsSf https://mistral.ai/vibe/install.sh | bash` sur macOS et Linux. Sur Windows, installez d’abord uv avec `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`, puis Vibe avec `uv tool install mistral-vibe`.

### Vous connecter

Une fois, tapez `claude`, `codex` ou `vibe` dans un nouveau terminal et suivez ce qu’il demande : votre navigateur s’ouvre pour vous connecter avec votre compte (pour Codex, « Sign in with ChatGPT »). Ensuite, Réglages › Moteurs montre les moteurs que Marianne trouve sur votre ordinateur ; quand l’un d’eux n’est pas connecté, « se connecter » ouvre sa connexion dans un terminal.

## Télécharger

Téléchargez le fichier de votre système en bas de la [page des versions](https://github.com/rodolphebarbanneau/marianne/releases).

- **Windows** : `Marianne-Setup-….exe`. Le programme n’est pas encore signé : Windows affiche « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis « Exécuter quand même ».
- **macOS** : le `.dmg` de votre puce (`arm64` pour Apple, `x64` pour Intel). L’application n’est pas notariée : au premier lancement, faites clic droit › Ouvrir, ou Réglages Système › Confidentialité et sécurité › « Ouvrir quand même ».
- **Linux** : le `.deb`, ou l’`AppImage` (rendez-la exécutable : `chmod +x`).

## Les mises à jour

Sur Windows et Linux, les versions suivantes s’installent d’elles-mêmes (Réglages › À propos et mises à jour). Sur macOS, l’application n’étant pas encore signée, la mise à jour automatique ne marche pas : téléchargez la nouvelle version depuis la page des versions.

## Ouvrir une archive d’un double clic

Une fois Marianne installée, un fichier `.marianne` s’ouvre dans Marianne d’un double clic. Sur macOS, rangez d’abord l’application dans le dossier Applications et ouvrez-la une fois. Sur Linux, c’est le cas avec le `.deb`, pas avec l’`AppImage`.
