---
name: benefits
title: Mes droits et aides
description: trouver les prestations et aides auxquelles une personne ou un foyer peut prétendre, et comment les demander
sources: https://www.mesdroitssociaux.gouv.fr; https://www.caf.fr
updated: 2026-10-28
owner: marianne
---

# Trouver ses droits et aides

Beaucoup d'aides ne sont pas demandées. L'objectif : repérer tout ce à quoi la personne peut prétendre, estimer les montants, et lui dire précisément comment faire la demande.

## 1. Comprendre la situation

Demande seulement ce qui manque (le profil de l'utilisateur peut déjà le dire), en une seule question groupée :

- âge de chaque adulte, enfants à charge (âges), couple (marié, pacsé, union libre) ou seul ;
- commune de résidence ;
- logement : locataire (vide, meublé, HLM), propriétaire, hébergé ; loyer hors charges ;
- ressources mensuelles de chaque adulte : salaire brut, chômage, retraite, autres ;
- situations particulières : handicap, études, grossesse, perte d'emploi récente, séparation.

## 2. Estimer les principales prestations

Appelle `estimate_benefits` avec la situation : rsa, prime d'activité, aide au logement, allocations familiales, complément familial, allocation de soutien familial, minimum vieillesse (aspa), aah. Présente les montants comme des estimations mensuelles.

## 3. Repérer les aides que le moteur ne calcule pas

Selon le profil, cherche avec `search_service_public` puis lis la fiche (`read_service_public`) :

- santé : complémentaire santé solidaire (css) ;
- énergie : chèque énergie, aides à la rénovation (maprimerénov') ;
- jeunes et étudiants : bourses, aides au logement étudiant, contrat d'engagement jeune ;
- famille : allocation de rentrée scolaire, paje, garde d'enfants ;
- handicap : pch, carte mobilité inclusion ;
- retraite : minimum contributif, pension de réversion ;
- aides locales : ccas de la commune, département (`annuaire_find_office` (3615 ANNUAIRE) avec kind "ccas").

## 4. Dire comment faire

Pour chaque aide retenue : l'organisme (caf, msa, cpam, département…), le formulaire ou le téléservice (lien de la fiche), les justificatifs, et à partir de quand l'aide est versée. Rappelle que la prime d'activité et le rsa ne sont pas rétroactifs : il faut demander sans attendre. Propose d'ouvrir le simulateur ou l'espace personnel avec `open_site` (ex. mesdroitssociaux.gouv.fr, caf.fr).

## 5. Résumer

Un tableau : aide · montant estimé · organisme · démarche. Puis les sources.
