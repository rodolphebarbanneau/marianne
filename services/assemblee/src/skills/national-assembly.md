---
name: national-assembly
title: Assemblée nationale
description: trouver son député, ses votes et ses fonctions, les scrutins sur un sujet, l'agenda, les vidéos des séances et commissions
---

# Assemblée nationale

## Trouver un député

- Par nom : `assemblee_deputy`. Par territoire : `assemblee_deputies` avec le département (nom ou numéro), et la circonscription si on la connaît ; ceux de l'utilisateur : `assemblee_deputies` avec `mine`, le département de son adresse.
- La circonscription dépend de l'adresse exacte. Si l'utilisateur ne la connaît pas, liste les députés du département avec leur circonscription et propose de vérifier sur le site de l'Assemblée (`open_site` https://www.assemblee-nationale.fr/dyn/vos-deputes).
- Si son adresse n'est pas renseignée, rappelle-lui qu'il peut la compléter dans Réglages → Identité.

## Votes

- `assemblee_ballots` cherche les scrutins publics par sujet et dates ; avec `deputy`, il montre le vote du député sur chacun. `assemblee_ballot` donne le détail : décompte et position de chaque groupe.
- Précise toujours que seuls les scrutins publics sont nominatifs : beaucoup de votes se font à main levée et ne disent rien des positions individuelles. Une absence peut s'expliquer par des travaux en commission au même moment.
- Le vote « sur l'ensemble » d'un texte est le vote final de l'Assemblée sur ce texte en cette lecture (option `final`).

## Agenda

- `assemblee_agenda` donne les séances publiques (ordre du jour) et les réunions de commission d'un jour, avec les horaires (heure de Paris), les lieux, et ce qui est filmé ou diffusé en direct.

## Vidéos

- `assemblee_videos` liste les vidéos d'une période (séance publique, commissions, questions au gouvernement), par mots du titre ou par orateur ; `assemblee_video` donne l'ordre du jour et l'horodatage de chaque intervention avec l'orateur.
- Cite les liens de vidéos : Marianne les affiche comme des lecteurs. Pour un passage, ajoute ?timecode=<millisecondes> (le timecode du chapitre).
- `assemblee_live` indique ce qui est diffusé en direct, et ce qui est annoncé pour plus tard dans la journée.

## Données

- Les députés, les scrutins et l'agenda viennent des données ouvertes de l'Assemblée, gardées hors ligne et mises à jour chaque jour. Tant qu'elles ne sont pas téléchargées, dis-le à l'utilisateur : il peut les mettre à jour depuis le service 3615 ASSEMBLEE.

## Textes

Pour suivre un projet ou une proposition de loi, cherche son dossier législatif sur assemblee-nationale.fr (recherche web) et sur vie-publique.fr pour une explication ; cite les numéros de scrutins correspondants.
