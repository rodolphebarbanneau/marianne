# Aide

## En cas de problème

- **Phrase de passe oubliée.** Sur l’écran de verrouillage, choisissez « phrase oubliée ? utiliser la clé de secours », puis une nouvelle phrase de passe.
- **Le code ne marche plus.** Après 5 erreurs, il faut de nouveau la phrase de passe. Vous pourrez ensuite remettre un code.
- **Marianne ne répond pas.** Vérifiez que votre moteur est installé et connecté : les témoins en bas à gauche, et Réglages › Moteurs, où « se connecter » ouvre sa connexion. Pour l’installer, voir [Installer Marianne](install.md).
- **Une tâche planifiée ne s’est pas faite.** Elle ne se fait que Marianne ouverte et votre archive déverrouillée, à la première ouverture de son jour ou après, et jamais pendant que Marianne vous répond. Vérifiez qu’elle n’est pas en pause, dans Démarches › « tâches planifiées ».
- **L’écran n’est pas à jour.** Rechargez la fenêtre, avec ctrl+maj+R (cmd+maj+R sur macOS) ou le bouton en haut à droite. L’archive reste ouverte.
- **L’archive est pleine.** Faites de la place dans Réglages › Place et emplacement.

Dans l’application, F1 ouvre le guide, avec les liens vers le projet.

## Signaler un bug

L’insecte en haut à droite de la fenêtre prépare le rapport pour vous. Dites ce que vous avez vu : votre moteur le lit avec le diagnostic de Marianne (sa version, votre système, l’écran où vous étiez, ses dernières erreurs, le déroulé du dossier ouvert sans vos messages, la fin de son journal) et en fait un rapport en anglais : ce qui s’est passé, comment le refaire, d’où cela peut venir. Il travaille sans outil ni web, et ne lit que cela. Décochez l’analyse pour un rapport fait de vos mots et du diagnostic seuls.

Le rapport est public. Marianne en retire d’abord ce qu’elle sait être personnel (vos identifiants, votre nom, votre dossier personnel sur l’ordinateur, les adresses e-mail, les numéros) et vous le montre en entier : vous pouvez tout modifier. Rien ne part de Marianne : « ouvrir sur GitHub » ouvre le formulaire de bug du projet dans votre navigateur, rempli, et vous le relisez avant de le publier, avec un compte GitHub.

## Nous écrire

Ouvrez un ticket sur [GitHub](https://github.com/rodolphebarbanneau/marianne/issues/new/choose) : « Bug report » pour un problème, « Idea » pour une idée, « Content correction » pour une information fausse ou dépassée dans une démarche ou pour proposer une source d’information, « Feedback » pour un avis. Les formulaires sont en anglais, pour que chacun puisse suivre le projet : écrivez en anglais si vous le pouvez. N’y écrivez **aucune donnée personnelle** : les tickets sont publics.

Une faille de sécurité se signale en privé, jamais dans un ticket : voir la [politique de sécurité](https://github.com/rodolphebarbanneau/marianne/blob/main/SECURITY.md).

## Tester la version alpha

Merci de tester Marianne. C’est une version alpha : elle sert à trouver ce qui ne va pas avant une vraie sortie.

- Des choses vont casser. Une version alpha suivante pourrait ne pas relire l’archive de celle-ci, alors n’y mettez rien que vous ne puissiez ressaisir.
- Mistral Vibe n’a pas encore été essayé avec une vraie installation.

Ce qu’on aimerait que vous essayiez :

1. Créer votre archive : la phrase de passe, puis la **clé de secours**. Notez-la.
2. Mettre un code pour rouvrir l’archive vite, sur cet ordinateur.
3. Renseigner un peu de votre profil (Réglages › Moi), si vous le souhaitez : rien ne quitte votre ordinateur, et le moteur ne voit jamais vos numéros, seulement des jetons.
4. Poser une vraie question à Marianne, sur une démarche que vous avez en cours.
5. Suivre une démarche guidée (Démarches › un domaine).
6. Parcourir les Services : 3615 INFOS, METEO, CARTE, PARLEMENT, ANNUAIRE, PEAGE.
