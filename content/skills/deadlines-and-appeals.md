---
name: deadlines-and-appeals
title: Délais et recours
description: contester une décision (administration, organisme social, amende, justice) dans les délais, et calculer les échéances
sources: F2474; F1736; F18074; https://www.antai.gouv.fr; https://citoyens.telerecours.fr; https://www.defenseurdesdroits.fr
updated: 2026-10-28
owner: marianne
---

# Délais et recours

## Principes

- Une décision défavorable doit indiquer les voies et délais de recours. Lis-les en priorité dans le courrier.
- Le délai court en général à partir de la notification (réception du courrier), pas de la date de la décision.
- Calcule toujours l'échéance avec `compute_deadline`. Il applique les règles du code de procédure civile (le jour de départ ne compte pas ; un délai en mois finit le même quantième ; une échéance un samedi, un dimanche ou un jour férié est reportée au jour ouvrable suivant). Pour un recours devant le juge administratif, le délai est franc : `rule: clear_days`.

## Les voies de recours courantes (à vérifier dans la fiche Service-Public de la procédure)

- **Décision administrative** : recours gracieux (auprès de l'auteur) ou hiérarchique, en principe dans les deux mois ; puis recours devant le tribunal administratif, en principe dans les deux mois suivant la notification ou le rejet du recours (Télérecours citoyens permet de saisir le tribunal en ligne). Le silence gardé par l'administration vaut le plus souvent rejet, parfois acceptation : vérifie pour la démarche en cause.
- **Organismes sociaux (caf, cpam, msa)** : recours préalable obligatoire devant la commission de recours amiable, dans le délai indiqué sur la décision, avant tout recours en justice ; les médiateurs de ces organismes peuvent aussi être saisis.
- **Impôts** : réclamation contentieuse, avec un délai propre à chaque impôt (voir la compétence taxes).
- **Amendes (ANTAI)** : contestation ou requête en exonération sur antai.gouv.fr dans le délai indiqué sur l'avis ; il est plus court pour l'amende forfaitaire que pour l'amende majorée.
- **Justice civile** : les délais d'appel ou d'opposition figurent dans l'acte de signification ; ils sont courts (souvent quinze jours ou un mois). Oriente vers un avocat.

## Méthode

1. Identifie la décision, son auteur, sa date de notification et la voie de recours indiquée.
2. Lis la fiche Service-Public de la procédure (`search_service_public`), et si besoin les articles (`read_article`).
3. Calcule chaque échéance avec `compute_deadline` et donne-la en gras avec le jour de la semaine.
4. Propose le recours rédigé (voir la compétence official-letters), le mode d'envoi, et les aides gratuites : Défenseur des droits (litige avec un service public), conciliateur de justice, point-justice, médiateur de l'organisme, aide juridictionnelle.
