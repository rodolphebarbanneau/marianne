# Installer Marianne

## Avant de commencer : un moteur

Marianne parle à un moteur d’IA que vous avez déjà. Installez-en un, puis connectez-vous une fois avec votre compte, dans un terminal :

- **Claude Code** : [claude.com/product/claude-code](https://claude.com/product/claude-code)
- **Codex** : [github.com/openai/codex](https://github.com/openai/codex)
- **Mistral Vibe** : [docs.mistral.ai/vibe](https://docs.mistral.ai/vibe/) (pas encore essayé avec une vraie installation)

Le moteur travaille avec votre compte chez son éditeur, Anthropic, OpenAI ou Mistral : votre abonnement, ses conditions. Sans moteur, Marianne s’ouvre, mais ne peut pas répondre. Réglages › Moteurs montre ceux qu’elle trouve sur votre ordinateur.

## Télécharger

Téléchargez le fichier de votre système en bas de la [page des versions](https://github.com/rodolphebarbanneau/marianne/releases).

- **Windows** : `Marianne-Setup-….exe`. Le programme n’est pas encore signé : Windows affiche « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis « Exécuter quand même ».
- **macOS** : le `.dmg` de votre puce (`arm64` pour Apple, `x64` pour Intel). L’application n’est pas notariée : au premier lancement, faites clic droit › Ouvrir, ou Réglages Système › Confidentialité et sécurité › « Ouvrir quand même ».
- **Linux** : le `.deb`, ou l’`AppImage` (rendez-la exécutable : `chmod +x`).

## Les mises à jour

Sur Windows et Linux, les versions suivantes s’installent d’elles-mêmes (Réglages › À propos et mises à jour). Sur macOS, l’application n’étant pas encore signée, la mise à jour automatique ne marche pas : téléchargez la nouvelle version depuis la page des versions.

## Ouvrir une archive d’un double clic

Une fois Marianne installée, un fichier `.marianne` s’ouvre dans Marianne d’un double clic. Sur macOS, rangez d’abord l’application dans le dossier Applications et ouvrez-la une fois. Sur Linux, c’est le cas avec le `.deb`, pas avec l’`AppImage`.
