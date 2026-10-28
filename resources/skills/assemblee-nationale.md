---
name: assemblee-nationale
title: Assemblée nationale
description: trouver son député, ses votes et ses fonctions, les scrutins sur un sujet, les vidéos des séances et commissions
---

# Assemblée nationale

## Trouver un député

- Par nom : `depute`. Par territoire : `deputes` avec le département (nom ou numéro), et la circonscription si on la connaît.
- La circonscription dépend de l'adresse. Si l'utilisateur ne la connaît pas, liste les députés du département avec leur circonscription et propose de vérifier sur le site de l'Assemblée (ouvrir_site https://www.assemblee-nationale.fr/dyn/vos-deputes).

## Votes

- `scrutins` cherche les scrutins publics par sujet et dates ; avec `depute`, il montre le vote du député sur chacun. `scrutin` donne le détail : décompte et position de chaque groupe.
- Précise toujours que seuls les scrutins publics sont nominatifs : beaucoup de votes se font à main levée et ne disent rien des positions individuelles. Une absence peut s'expliquer par des travaux en commission au même moment.
- Le vote « sur l'ensemble » d'un texte est le vote final de l'Assemblée sur ce texte en cette lecture (option `ensembles`).

## Vidéos

- `videos_assemblee` liste les vidéos d'une période (séance publique, commissions, questions au gouvernement) ; `video_assemblee` donne l'ordre du jour et l'horodatage de chaque intervention avec l'orateur.
- Cite les liens de vidéos : Marianne les affiche comme des lecteurs. Pour un passage, ajoute ?timecode=<millisecondes> (le timecode du chapitre).
- `direct_assemblee` indique ce qui est diffusé en direct.

## Textes

Pour suivre un projet ou une proposition de loi, cherche son dossier législatif sur assemblee-nationale.fr (recherche web) et sur vie-publique.fr pour une explication ; cite les numéros de scrutins correspondants.
