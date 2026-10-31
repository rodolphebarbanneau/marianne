# Installer Marianne

Trois étapes, une fois pour toutes : installer un moteur d’IA, installer Marianne, puis connecter le moteur à votre compte. Comptez un quart d’heure.

## Avant de commencer : un moteur

Marianne n’a pas d’IA à elle : elle fait travailler un moteur d’IA, avec votre compte chez son éditeur. Ce moteur est un programme **en ligne de commande** (en anglais, un « CLI ») : il s’installe sur votre ordinateur et travaille sans fenêtre à lui. C’est ce programme qu’il faut installer.

L’application de bureau ou le site de l’éditeur (Claude, ChatGPT, Codex, Vibe) **ne suffisent pas** : Marianne ne s’en sert pas, même quand ils contiennent un moteur. Ils ne sont pas nécessaires non plus : gardez-les si vous voulez, Marianne n’en dépend pas.

Choisissez un moteur selon le compte que vous avez :

- **Claude Code**, d’Anthropic : le programme `claude`. Il faut un abonnement Claude Pro, Max, Ultra, Team ou Enterprise, ou un compte Claude Console, payé à l’usage. L’offre gratuite de Claude ne comprend pas Claude Code. La page officielle : [code.claude.com/docs/fr/setup](https://code.claude.com/docs/fr/setup).
- **Codex CLI**, d’OpenAI : le programme `codex`. Il faut une offre ChatGPT Plus ou supérieure, ou une clé d’API OpenAI : avec les offres Free et Go, Codex n’existe que dans l’application ChatGPT, pas en ligne de commande. La page officielle : [learn.chatgpt.com/docs/codex/cli](https://learn.chatgpt.com/docs/codex/cli).
- **Mistral Vibe**, de Mistral AI : le programme `vibe`. Il marche avec un compte Mistral, gratuit (quelques sessions) ou Pro. Il n’a pas encore été essayé avec une vraie installation. La page officielle : [docs.mistral.ai/vibe/code/cli/install-setup](https://docs.mistral.ai/vibe/code/cli/install-setup).

Le moteur travaille avec votre compte chez son éditeur : votre abonnement, ses conditions. Sans moteur, Marianne s’ouvre, mais ne peut pas répondre.

## Installer le moteur

Une ligne à copier dans un terminal, la fenêtre où l’on tape des commandes. Pas besoin d’être administrateur, ni de savoir programmer.

1. **Ouvrez un terminal.**
   - Windows : ouvrez le menu Démarrer, tapez `powershell`, puis Entrée. Dans la fenêtre qui s’ouvre, la ligne commence par `PS C:\Users\…>`.
   - macOS : cmd+espace, tapez `terminal`, puis Entrée.
   - Linux : ctrl+alt+T, sur la plupart des systèmes.
2. **Copiez la ligne** de votre moteur et de votre système, ci-dessous.
3. **Collez-la** dans le terminal (clic droit ou ctrl+V sur Windows, cmd+V sur macOS, ctrl+maj+V sur Linux), puis appuyez sur Entrée.
4. **Attendez** que le terminal vous rende la main : une nouvelle ligne apparaît, prête pour une autre commande. Cela prend une minute ou deux ; Claude Code n’affiche rien pendant son téléchargement, c’est normal.
5. **Fermez le terminal.**

Le moteur s’installe dans votre dossier personnel, pour vous seul. Si le terminal affiche une erreur en rouge, la page officielle de votre moteur, ci-dessus, dit quoi faire.

### Claude Code

Windows :

```powershell
irm https://claude.ai/install.ps1 | iex
```

macOS et Linux :

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Il se met ensuite à jour de lui-même. Pour une première fois dans un terminal, Anthropic a [un guide du terminal](https://code.claude.com/docs/fr/terminal-guide), et un [dépannage de l’installation](https://code.claude.com/docs/fr/troubleshoot-install), en français.

### Codex

Windows :

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

macOS et Linux :

```sh
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

La même ligne le met à jour.

### Mistral Vibe

macOS et Linux :

```sh
curl -LsSf https://mistral.ai/vibe/install.sh | bash
```

Windows, en deux temps. D’abord uv, l’outil qui installe Vibe :

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Puis fermez le terminal, ouvrez-en un nouveau, et collez :

```powershell
uv tool install mistral-vibe
```

Mistral vise d’abord macOS et Linux ; Vibe marche aussi sur Windows.

## Télécharger Marianne

Téléchargez le fichier de votre système en bas de la [page des versions](https://github.com/rodolphebarbanneau/marianne/releases).

- **Windows** : `Marianne-Setup-….exe`. Le programme n’est pas encore signé : Windows affiche « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis « Exécuter quand même ».
- **macOS** : le `.dmg` de votre puce (`arm64` pour Apple, `x64` pour Intel). L’application n’est pas notariée : au premier lancement, faites clic droit › Ouvrir, ou Réglages Système › Confidentialité et sécurité › « Ouvrir quand même ».
- **Linux** : le `.deb`, ou l’`AppImage` (rendez-la exécutable : `chmod +x`).

## Connecter le moteur

Ouvrez Marianne et créez votre archive ([Premiers pas](getting-started.md)). Puis ouvrez Réglages › Moteurs ; les témoins des moteurs, en bas à gauche, y mènent aussi d’un clic. Chaque moteur y montre son état :

- **« introuvable sur cet ordinateur »** : il n’est pas installé, ou Marianne était déjà ouverte pendant l’installation. Cliquez sur « réessayer ». S’il reste introuvable, reprenez [son installation](#installer-le-moteur).
- **« pas connecté »** : cliquez sur « se connecter ». Marianne ouvre un terminal où le moteur lance sa propre connexion, sans rien à taper : votre navigateur s’ouvre chez l’éditeur, où vous vous connectez avec votre compte. Pour Codex, choisissez « Sign in with ChatGPT » ; pour Vibe, « Launch browser », avec les flèches puis Entrée. Quand le navigateur dit que c’est fait, fermez le terminal et rouvrez Réglages › Moteurs.
- **« connecté · prêt »** : c’est fini, Marianne peut vous répondre.

**Une clé d’API sur votre ordinateur.** Si une variable comme `ANTHROPIC_API_KEY`, `CODEX_API_KEY` ou `MISTRAL_API_KEY` y est définie, le moteur la prendrait avant votre connexion, et une clé d’API est facturée à l’usage, en plus de votre abonnement. Quand le moteur a votre connexion, Marianne laisse la clé de côté et le dit sous le moteur ; la case « utiliser la clé de la variable… » la prend quand même. Sans connexion, Marianne passe par la clé, et le dit aussi.

Vous vous connectez chez l’éditeur, jamais dans Marianne : elle ne voit ni votre mot de passe ni votre connexion, que le moteur garde dans son dossier (`.claude`, `.codex` ou `.vibe`, dans votre dossier personnel). Vous pouvez aussi vous connecter sans Marianne : tapez `claude`, `codex` ou `vibe` dans un nouveau terminal et suivez ce qu’il demande.

## Les mises à jour

Sur Windows et Linux, les versions suivantes de Marianne s’installent d’elles-mêmes (Réglages › À propos et mises à jour). Sur macOS, l’application n’étant pas encore signée, la mise à jour automatique ne marche pas : téléchargez la nouvelle version depuis la page des versions.

## Ouvrir une archive d’un double clic

Une fois Marianne installée, un fichier `.marianne` s’ouvre dans Marianne d’un double clic. Sur macOS, rangez d’abord l’application dans le dossier Applications et ouvrez-la une fois. Sur Linux, c’est le cas avec le `.deb`, pas avec l’`AppImage`.
