---
id: pay-free-flow-toll
domain: mobility
title: Payer un péage en flux libre
description: autoroutes sans barrière (A13-A14, A79, A4 à Boulay) : payer sous 72 heures, éviter l'avis de paiement
when: dans les 72 heures qui suivent le passage
duration: 5 minutes
documents: la plaque d'immatriculation du véhicule; la date et l'heure du passage
sources: https://www.ecologie.gouv.fr/peage-flux-libre; https://www.assemblee-nationale.fr/dyn/17/questions/QANR5L17QE10290; https://www.cybermalveillance.gouv.fr/tous-nos-contenus/fiches-reflexes/hameconnage-phishing
updated: 2026-10-28
owner: marianne
---

## Noter le passage

Sur une autoroute en flux libre, il n'y a pas de barrière : des portiques lisent la plaque d'immatriculation et le montant est calculé à la fin de la section. Avec un badge de télépéage bien fixé au pare-brise, il n'y a rien à faire. Sinon, vous avez 72 heures après le passage pour payer.

Notez le trajet dans 3615 PEAGE : l'échéance rejoint vos rappels.

> setup: vehicles | Ajouter un véhicule
> service: peage | Ouvrir 3615 PEAGE

## Payer sur le site officiel

Payez avec la plaque d'immatriculation, par carte bancaire, sur le site de la société d'autoroute : Sanef pour l'A13, l'A14 et l'A4 à Boulay, ALIAE pour l'A79. 3615 PEAGE ouvre la bonne page. Sans internet, payez en espèces ou par carte chez un buraliste ou une maison de la presse du réseau Nirio.

Un compte gratuit sur le site de la société d'autoroute permet le paiement automatique et des rappels après chaque passage.

> service: peage | Ouvrir les pages de paiement
> open: https://www.ecologie.gouv.fr/peage-flux-libre | Lire la page du ministère

## Se méfier des faux SMS

Des escrocs envoient de faux SMS et e-mails réclamant un péage impayé. Ne répondez pas, ne cliquez sur aucun lien ni pièce jointe : tapez vous-même l'adresse du site officiel. Transférez le SMS suspect au 33700.

Si vous avez donné vos coordonnées bancaires sur un faux site, faites opposition auprès de votre banque.

> open: https://www.cybermalveillance.gouv.fr/tous-nos-contenus/fiches-reflexes/hameconnage-phishing | Lire la fiche hameçonnage

## Si vous recevez un avis de paiement

Passé 72 heures, la société d'autoroute dresse un procès-verbal et envoie un avis de paiement au titulaire de la carte grise : le péage, plus une indemnité forfaitaire de 90 €, ramenée à 10 € si vous payez sous 15 jours. Sans paiement sous deux mois, une amende forfaitaire majorée de 375 € est émise.

> document: letter | Ajouter l'avis de paiement
> ask: J'ai reçu un avis de paiement pour un péage en flux libre : que dois-je payer, et avant quand ? | Demander à Marianne
