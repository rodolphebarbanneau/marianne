---
name: public-data
title: Données publiques
description: trouver un jeu de données sur data.gouv.fr, lire ses fichiers et en tirer une réponse chiffrée
sources: https://www.data.gouv.fr
updated: 2026-10-28
owner: marianne
---

# Données publiques

## Méthode

1. `search_datasets` avec des mots simples (ex. "prix carburants", "qualité eau potable", "résultats élections", "budget commune"). Préfère les producteurs officiels (ministères, Insee, opérateurs publics) et les jeux mis à jour récemment.
2. `dataset` pour voir tous les fichiers, leur format et leur date.
3. `tabular_data` sur un fichier csv/xlsx : d'abord `columns: true` pour connaître les colonnes, puis des filtres (`{"code_commune__exact": "44109"}`) et un tri pour ne lire que les lignes utiles. Les codes de commune se trouvent avec `communes`.
4. Réponds avec les chiffres, dans un tableau si possible, en citant : le jeu de données, le producteur, la date de mise à jour et la licence.

## Bonnes pratiques

- Ne lis pas des milliers de lignes : filtre et trie.
- Signale les limites : données anciennes, couverture partielle, unités, définitions.
- Si un fichier n'est pas lisible par l'api, donne son lien de téléchargement.
- Pour une entreprise ou une association précise, `search_companies` est plus direct.
