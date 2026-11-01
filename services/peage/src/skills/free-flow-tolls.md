---
name: free-flow-tolls
title: Péage en flux libre
description: payer un péage d'autoroute sans barrière (A13-A14, A79, A4 à Boulay), le délai de 72 heures, l'avis de paiement, les faux SMS
---

# Péage en flux libre

Sur une autoroute en flux libre, il n'y a pas de barrière : des portiques lisent la plaque d'immatriculation (et le badge de télépéage s'il y en a un) et le montant est calculé à la fin de la section. Sans badge ni compte qui paie automatiquement, l'usager doit payer lui-même dans les 72 heures qui suivent le passage.

## Méthode

1. `peage_networks` donne les sections concernées, leur société d'autoroute, la page officielle de paiement, le délai et les autres moyens de paiement. Ne cite que ces pages.
2. `peage_trips` donne les trajets que l'utilisateur a notés, l'échéance de chacun et le temps restant. Si l'utilisateur te parle d'un passage qui n'y est pas, propose de le noter avec `peage_add_trip` (identifiant du véhicule, du réseau, date et heure du passage) : l'échéance rejoint ses rappels.
3. Le service ne connaît pas les montants : seule la page officielle les affiche, à partir de la plaque. N'en donne jamais, même approximatif.

## Payer avec l'utilisateur

1. Ouvre la page de paiement par plaque du réseau (`payUrl` dans `peage_networks`) avec `open_site`, puis `read_page`. Refuse les cookies ; chez ALIAE, choisis la recherche par « Plaque d'immatriculation ».
2. Saisis la plaque avec son jeton (`[[vehicle.1.plate]]`…) et lance la recherche, sans période de location. Montre à l'utilisateur ce qui est dû, tel que la page l'affiche : les passages, leur date quand elle est donnée, le montant.
3. Va jusqu'à la carte : clique les étapes du chemin (chez ALIAE : « Payer mes trajets », « carte bancaire », « Poursuivre vers le paiement ») et remplis ce que la page demande avant la carte (chez ALIAE : nom, adresse de facturation, e-mail, exigés pour le 3-D Secure) avec `read_form` puis `fill_form`, avec les jetons de ses identifiants. Un clic qui paierait sans `pay_by_card` (une carte enregistrée dans un compte, un paiement en un clic) : mets `consequential`.
4. Paie avec `pay_by_card`, en donnant le montant lu sur la page : sa carte de paiement est la seule confirmation que donne l'utilisateur, et couvre le clic sur le bouton de paiement qui suit. Ne demande jamais un numéro de carte dans la conversation.
5. `hand_over` quand la banque demande une confirmation (3-D Secure : un code, son application), ou quand l'utilisateur préfère saisir sa carte lui-même. Sans carte enregistrée, propose d'en ajouter une (`request_setup`, cible `payment`), ou `hand_over`.
6. Une fois le paiement confirmé par le site, marque les trajets payés avec `peage_mark_paid`. Un passage payé qui n'était pas noté : `peage_add_trip` d'abord, si la page donne sa date et son heure. Sans confirmation du site, ne marque rien.

Sans compte, le site peut montrer qu'une somme est due sans le détail de chaque passage : chez Sanef, seul le conducteur principal déclaré dans un compte le voit avant de payer (FAQ de la page de paiement de sanef.com).

## Avis de paiement reçu par courrier

- Passé 72 heures, la société d'autoroute envoie un avis de paiement au titulaire de la carte grise : le péage, plus une indemnité forfaitaire de 90 €, ramenée à 10 € si le paiement intervient sous 15 jours. Sans paiement sous deux mois, une amende forfaitaire majorée de 375 € est émise. Ces montants sont fixés par le décret n° 2020-1494.
- Pour un premier défaut de paiement, l'exploitant annule l'indemnité si le péage est réglé sous 10 jours (réponse du ministère des Transports, novembre 2025). À Boulay (A4), le premier oubli donne lieu à un simple rappel par courrier.
- L'avis se règle sur le site officiel de la société qui l'a émis : il y figure parmi les sommes dues. Lis les dates sur l'avis et calcule les échéances avec `compute_deadline`.

## Faux SMS et e-mails

- Des escrocs envoient de faux messages réclamant un péage impayé, parfois avec le nom ou la plaque de la personne. Sanef n'envoie aucun SMS pour le paiement du péage, et aucun lien de paiement officiel n'est envoyé par SMS.
- Conseille : ne pas répondre, ne cliquer sur aucun lien ni pièce jointe, taper soi-même l'adresse du site officiel, transférer le SMS au 33700. Si des coordonnées bancaires ont été saisies sur un faux site : faire opposition auprès de sa banque, signaler sur cybermalveillance.gouv.fr, porter plainte.

## Pièges

- Un badge de télépéage mal fixé peut ne pas être détecté : le passage reste alors à payer par la plaque.
- Un passage peut mettre jusqu'à 24 heures à apparaître sur le site de paiement (Sanef le dit sur sa page de paiement) : « rien à payer » juste après le passage ne veut pas dire payé.
- Pour une voiture de location, le site de paiement permet de limiter la recherche à la période de location ; chez Sanef, cette recherche ne remonte qu'aux 72 dernières heures (page « Payer sans se connecter » de sanef.com).
- Chez ALIAE, une plaque inconnue du fichier national des immatriculations ouvre un avertissement (« Continuer » ou « Annuler ») : vérifie la plaque avec l'utilisateur avant de continuer.
- L'A69 (Toulouse–Castres) et l'A40 (ATMB) préparent le flux libre ; tant qu'elles ne figurent pas dans `peage_networks`, renvoie vers le site de leur société d'autoroute sans affirmer de délai.
