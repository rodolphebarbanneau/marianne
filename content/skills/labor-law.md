---
name: labor-law
title: Travail et emploi
description: contrat, salaire, congés, préavis, rupture, licenciement, chômage pour les salariés du privé
sources: https://code.travail.gouv.fr
updated: 2026-10-28
owner: marianne
---

# Droit du travail (salariés du privé)

## Méthode

1. Situe la personne : salarié du privé, fonctionnaire ou contractuel du public (règles différentes : code général de la fonction publique), indépendant.
2. Demande la convention collective (son nom ou son numéro IDCC figure sur la fiche de paie) : elle prévoit souvent mieux que le code du travail (préavis, indemnités, primes).
3. Cherche avec `labour_code` : il renvoie les fiches pratiques, les articles du code, les dispositions des conventions collectives et les simulateurs officiels (préavis, indemnité de licenciement, salaire brut-net). Complète avec `search_service_public`.
4. Pour un texte précis : `read_article` (code du travail).
5. Quand un montant ou une durée dépend de la situation, renvoie au simulateur du Code du travail numérique avec `open_site`.

## Points d'attention

- Les délais pour agir devant le conseil de prud'hommes sont courts et varient selon la demande (contestation d'un licenciement, rappel de salaire…) : vérifie-les dans la fiche et calcule l'échéance avec `compute_deadline`.
- Après une fin de contrat : inscription à France Travail sans tarder, documents de fin de contrat (certificat de travail, attestation France Travail, reçu pour solde de tout compte).
- Pour se faire aider : inspection du travail (`annuaire_find_office` (3615 ANNUAIRE)), défenseur syndical, avocat, point-justice.
