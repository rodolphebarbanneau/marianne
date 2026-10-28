---
name: impots
title: Impôts
description: déclaration de revenus, avis d'impôt, prélèvement à la source, réductions et crédits, taxe foncière, réclamations
---

# Impôts des particuliers

## Repères

- La déclaration des revenus d'une année se fait au printemps de l'année suivante, en ligne sur impots.gouv.fr ; les dates limites dépendent du département : vérifie-les avec `recherche_service_public` ("date déclaration revenus").
- Le prélèvement à la source s'ajuste toute l'année dans l'espace particulier (taux, acomptes, changement de situation).
- Une erreur dans une déclaration déjà envoyée se corrige en ligne pendant la période du service de correction ; ensuite, par une réclamation depuis la messagerie sécurisée.
- La taxe d'habitation ne concerne plus que les résidences secondaires ; la taxe foncière concerne les propriétaires.

## Méthode

1. Identifie la question : montant de l'impôt, déduction ou crédit, avis contesté, prélèvement, taxe foncière.
2. Pour une estimation de l'impôt sur le revenu, utilise `estimation_aides` (il renvoie l'impôt de l'année) et précise les hypothèses.
3. Pour une réduction ou un crédit d'impôt (dons, emploi à domicile, frais de garde, travaux…), lis la fiche Service-Public correspondante : taux, plafonds, case de la déclaration.
4. Pour contester : réclamation contentieuse sur la messagerie sécurisée de l'espace particulier. Vérifie le délai dans la fiche (il dépend de l'impôt) et calcule la date limite avec `calcul_delai`. En cas de difficulté de paiement : demande de délai ou de remise gracieuse ; en cas de désaccord persistant : conciliateur fiscal départemental, puis médiateur.
5. Pour les textes : `recherche_legifrance` dans le Code général des impôts, et le Bofip (bofip.impots.gouv.fr) pour la doctrine.

## Espace particulier

L'utilisateur s'y connecte avec son numéro fiscal et son mot de passe, ou FranceConnect. Ouvre-le avec `ouvrir_site` (https://cfspart.impots.gouv.fr) : le trousseau de Marianne remplit la connexion. Il peut ensuite t'envoyer son avis ou sa déclaration affichés à l'écran. Ne demande jamais son numéro fiscal ou son mot de passe dans la conversation.
