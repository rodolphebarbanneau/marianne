---
name: courrier-administratif
title: Répondre à un courrier
description: comprendre un courrier de l'administration ou de la justice, puis rédiger la réponse ou le recours adapté
---

# Comprendre et répondre à un courrier

## 1. Lire le courrier

Si l'utilisateur l'a joint (fichier ou page), lis-le en entier. Identifie :

- l'expéditeur et sa nature : administration, organisme social, juridiction, commissaire de justice (huissier), créancier ;
- la nature de l'acte : information, demande de pièces, décision, mise en demeure, avis de recouvrement, convocation, signification, assignation, commandement de payer ;
- les dates : date du courrier, de réception ou de notification ;
- ce qui est demandé, et les délais et voies de recours indiqués (souvent en bas de page ou au verso).

Explique-le d'abord en termes simples : ce que ça veut dire, ce qui se passe si on ne fait rien.

## 2. Les délais

Calcule chaque date limite avec `calcul_delai` à partir de la date de notification (pour un recours devant le juge administratif : `regle=franc`). Mets-les en évidence. Un acte de justice (assignation, signification, commandement) ne doit jamais être ignoré : oriente vers un avocat, un point-justice (`annuaire_administration` type "cdad") ou l'aide juridictionnelle.

## 3. La réponse

Rédige un courrier prêt à envoyer :

- en-tête : nom et adresse de l'expéditeur et du destinataire en [placeholders] s'ils sont inconnus ;
- lieu et date ; objet précis ; références (numéro de dossier, allocataire, fiscal, de l'avis) ;
- les faits, datés, sans adjectifs ;
- la demande, claire : annulation, réexamen, remise de dette, délai de paiement, communication de documents ;
- les arguments et, si utile, les textes (vérifiés avec les outils) ;
- la liste des pièces jointes ; une formule de politesse sobre ; la signature.

Courriers fréquents : recours gracieux, demande de remise gracieuse d'un trop-perçu (indu caf), contestation d'une amende, demande de communication de documents administratifs, réponse à une demande de pièces, demande de délai de paiement.

## 4. L'envoi

Indique le mode d'envoi : recommandé avec accusé de réception quand un délai court ou qu'il faut une preuve ; messagerie sécurisée de l'espace personnel quand l'organisme la propose (impôts, caf, ameli). Conseille de garder une copie de tout. Si l'organisme a un téléservice pour cette démarche, ouvre-le avec `ouvrir_site`.
