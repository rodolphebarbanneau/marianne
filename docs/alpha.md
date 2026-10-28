# Marianne 0.1.0-alpha.1 · guide des testeurs

Merci de tester Marianne. C’est une version alpha : elle sert à trouver ce qui ne va pas avant une vraie sortie.

Marianne est un assistant citoyen pour votre ordinateur : vos droits, vos démarches, vos papiers et vos échéances, l’information publique. Elle travaille avec votre propre Claude Code, Codex ou Mistral Vibe, et garde tout dans une archive chiffrée, sur votre ordinateur. Marianne est un projet indépendant, sans lien avec l’État ni avec aucune administration ; elle aide à comprendre et à préparer, elle ne remplace ni l’administration ni un conseil juridique.

## Avant de commencer

Marianne parle à un moteur d’IA que vous avez déjà : installez **Claude Code** ([claude.com/product/claude-code](https://claude.com/product/claude-code)) ou **Codex** ([github.com/openai/codex](https://github.com/openai/codex)), puis connectez-vous une fois, dans un terminal, avec votre compte. Sans moteur, Marianne s’ouvre, mais ne peut pas répondre.

## Installer

Téléchargez le fichier de votre système en bas de la page de la version.

- **Windows** : `Marianne-Setup-….exe`. Le programme n’est pas encore signé : Windows affiche « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis « Exécuter quand même ».
- **macOS** : le `.dmg` de votre puce (`arm64` pour Apple, `x64` pour Intel). L’application n’est pas notariée : au premier lancement, faites clic droit › Ouvrir, ou Réglages Système › Confidentialité et sécurité › « Ouvrir quand même ».
- **Linux** : l’`AppImage` (rendez-la exécutable : `chmod +x`), ou le `.deb`.

Sur Windows et Linux, les versions suivantes s’installeront d’elles-mêmes (Réglages › À propos et mises à jour). Sur macOS, l’application n’étant pas encore signée, la mise à jour automatique ne marche pas : téléchargez la nouvelle version depuis la page des versions.

## Ce qu’on aimerait que vous essayiez

1. Créer votre archive : la phrase de passe, puis la **clé de secours**. Notez-la : sans phrase de passe ni clé de secours, personne ne peut rouvrir l’archive, pas même nous.
2. Mettre un code pour rouvrir l’archive vite, sur cet ordinateur.
3. Renseigner un peu de votre profil (Réglages › Moi), si vous le souhaitez : rien ne quitte votre ordinateur, et le moteur ne voit jamais vos numéros, seulement des jetons.
4. Poser une vraie question à Marianne, sur une démarche que vous avez en cours.
5. Suivre une démarche guidée (Démarches › un domaine).
6. Parcourir les Actualités et les Services : 3615 METEO, CARTE, ASSEMBLEE, ANNUAIRE, PEAGE.

## Bon à savoir

- C’est une alpha : des choses vont casser. Une version alpha suivante pourrait ne pas relire l’archive de celle-ci ; n’y mettez rien que vous ne puissiez ressaisir.
- Mistral Vibe n’a pas encore été essayé avec une vraie installation.
- Le navigateur intégré demande votre accord avant d’aller en ligne, et toujours avant de signer, payer ou envoyer. Vous pouvez « prendre la main » à tout moment.

## Nous dire ce qui ne va pas

Ouvrez un ticket sur [github.com/rodolphebarbanneau/marianne/issues](https://github.com/rodolphebarbanneau/marianne/issues/new/choose) : « Un problème » ou « Un avis, une idée ». N’y écrivez **aucune donnée personnelle** : les tickets sont publics.
