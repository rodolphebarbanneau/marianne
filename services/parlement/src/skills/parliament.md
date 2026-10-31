---
name: parliament
title: Parlement
description: trouver son député et ses sénateurs, leurs votes et leurs fonctions, les scrutins sur un sujet, l'agenda des deux chambres, les vidéos des séances et commissions
---

# Parlement : Assemblée nationale et Sénat

## Trouver ses élus

- Ceux de l'utilisateur : `parlement_members` avec `mine` : son député (la circonscription de son adresse) et les sénateurs de son département. Si la circonscription n'est pas certaine (commune partagée entre plusieurs, adresse sans coordonnées), dis-le et propose de vérifier sur le site de l'Assemblée (`open_site` https://www.assemblee-nationale.fr/dyn/vos-deputes).
- Par nom : `parlement_member`. Par territoire ou par groupe : `parlement_members` avec le département (nom ou numéro), la circonscription, le groupe (sigle ou nom) et la chambre (`assemblee`, `senat`).
- Si son adresse n'est pas renseignée, rappelle-lui qu'il peut la compléter dans Réglages → Identité.
- Les sénateurs sont élus par les grands électeurs de leur département : ils n'ont pas de circonscription au sens des députés.

## Votes

- `parlement_ballots` cherche les scrutins publics des deux chambres par sujet et dates ; avec `member`, il montre le vote de l'élu sur chacun. `parlement_ballot` donne le détail : qui a déposé l'amendement (et son groupe), décompte, position de chaque groupe, voix dissidentes.
- Précise toujours que seuls les scrutins publics sont nominatifs : beaucoup de votes se font à main levée et ne disent rien des positions individuelles. Une absence peut s'expliquer par des travaux en commission au même moment ; un vote « par délégation » a été émis par un collègue.
- Au Sénat, un groupe vote souvent pour l'ensemble de ses membres : un vote de sénateur dit la position de son groupe plus que sa présence.
- Le vote « sur l'ensemble » d'un texte est le vote final de la chambre sur ce texte en cette lecture (option `final`).

## Agenda

- `parlement_agenda` donne les séances publiques (ordre du jour) et les réunions de commission d'un jour ou de quelques jours, dans les deux chambres, avec les horaires (heure de Paris), les lieux, et ce qui est filmé ou diffusé en direct.

## Vidéos

- `parlement_videos` liste les vidéos d'une période (séance publique, commissions, questions au gouvernement) de l'Assemblée et du Sénat, par mots du titre ou par orateur ; `parlement_video` donne l'ordre du jour et l'horodatage de chaque intervention avec l'orateur.
- Cite les liens de vidéos : Marianne les affiche comme des lecteurs. Pour un passage, ajoute `?timecode=<millisecondes>` (le timecode du chapitre).
- `parlement_live` indique ce qui est diffusé en direct dans les deux chambres, et ce que l'Assemblée annonce pour plus tard dans la journée.

## Données

- Les députés, les sénateurs, les scrutins et l'agenda de l'Assemblée viennent des données ouvertes des deux chambres, gardées hors ligne et mises à jour chaque jour. Tant qu'elles ne sont pas téléchargées, dis-le à l'utilisateur : il peut les mettre à jour depuis le service 3615 PARLEMENT.

## Textes

Pour suivre un projet ou une proposition de loi, cherche son dossier législatif sur assemblee-nationale.fr ou senat.fr (recherche web) et sur vie-publique.fr pour une explication ; cite les numéros de scrutins correspondants.
