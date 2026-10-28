import type { TollNetwork } from './types'

/**
 * The motorway sections with free-flow tolling, as their operators and the ministry of Transport
 * describe them. The operators publish no API: the amounts due are only shown on their own
 * payment pages, from the plate. Each entry says what it is based on and when it was checked.
 */

const MINISTRY = 'https://www.ecologie.gouv.fr/peage-flux-libre'
/** The ministry of Transport's answer to written question 10290 (JO, 18 November 2025): 72 hours, the notice and its amounts. */
const ANSWER = 'https://www.assemblee-nationale.fr/dyn/17/questions/QANR5L17QE10290'
const SANEF_SCAMS = 'https://www.autoroutes.sanef.com/fr/assistance/flux-libre/phishing-vous-avez-un-doute'

const NOTICE = (operator: string) =>
  `Passé 72 h, ${operator} dresse un procès-verbal et envoie par courrier un avis de paiement au titulaire de la carte grise : le péage, plus une indemnité forfaitaire de 90 €, ramenée à 10 € si vous payez sous 15 jours. Sans paiement sous deux mois, une amende forfaitaire majorée de 375 € est émise.`

const NIRIO = 'chez un buraliste ou une maison de la presse du réseau Nirio, en espèces ou par carte bancaire'

export const NETWORKS: readonly TollNetwork[] = [
  {
    id: 'a13-a14',
    name: 'A13-A14 Paris–Normandie',
    short: 'A13-A14',
    motorways: ['A13', 'A14'],
    operator: 'Sanef',
    payUrl: 'https://www.sanef.com/',
    accountUrl: 'https://www.sanef.com/client/index.html',
    deadlineHours: 72,
    channels: [
      'badge de télépéage bien fixé au pare-brise : rien à faire',
      'compte client Sanef, gratuit : paiement automatique par carte bancaire, rappel après chaque passage',
      'en ligne sur sanef.com avec la plaque, par carte bancaire, sans compte',
      NIRIO
    ],
    penalties: NOTICE('Sanef'),
    phone: '09 708 08 709',
    sources: [MINISTRY, ANSWER, 'https://www.autoroutes.sanef.com/fr/assistance/compte-client/compte-client-obligatoire', SANEF_SCAMS],
    checked: '2026-10-28'
  },
  {
    id: 'a79',
    name: 'A79 Sazeret – Digoin',
    short: 'A79',
    motorways: ['A79'],
    operator: 'ALIAE',
    payUrl: 'https://paiement.aliae.com/fr/',
    deadlineHours: 72,
    channels: [
      'badge de télépéage bien fixé au pare-brise : prélèvement vers le 15 du mois suivant',
      'en ligne sur paiement.aliae.com avec la plaque, par carte bancaire',
      NIRIO,
      'bornes de paiement le long de l’A79 : espèces, carte bancaire ou carte pétrolière (appelées à disparaître)'
    ],
    penalties: NOTICE('ALIAE'),
    phone: '08 06 00 50 05',
    sources: [
      MINISTRY,
      ANSWER,
      'https://paiement.aliae.com/fr/quels-sont-les-moyens-de-paiement-pour-regler-mon-trajet-en-flux-libre--8310394478509599828',
      'https://paiement.aliae.com/fr/attention-aux-arnaques-faux-sites-de-paiement-sms-et-e-mails--5852543856745076374'
    ],
    checked: '2026-10-28'
  },
  {
    id: 'a4-boulay',
    name: 'A4 Boulay-Moselle (sortie 36)',
    short: 'A4 Boulay',
    motorways: ['A4'],
    operator: 'Sanef',
    payUrl: 'https://www.sanef.com/',
    accountUrl: 'https://www.sanef.com/client/index.html',
    deadlineHours: 72,
    channels: [
      'badge de télépéage Liber-t bien fixé au pare-brise : prélèvement le mois suivant',
      'paiement automatique : plaque et carte bancaire associées avant le trajet, dans un compte Sanef',
      'en ligne sur sanef.com avec la plaque',
      'borne de paiement sur le parking après le portique de Boulay, en espèces'
    ],
    penalties:
      'Passé 72 h après le premier passage : un rappel par courrier la première fois, sinon un avis de paiement avec une indemnité forfaitaire (90 €, ramenée à 10 € si vous payez sous 15 jours ; 375 € d’amende forfaitaire majorée sans paiement sous deux mois).',
    phone: '09 708 08 709',
    sources: ['https://www.autoroutes.sanef.com/en/assistance/boulay/how-boulay-works', MINISTRY],
    checked: '2026-10-28'
  }
]

/** What the operators and the State say of the fake messages that claim an unpaid toll. */
export const SCAM_SOURCES: readonly string[] = [
  SANEF_SCAMS,
  MINISTRY,
  'https://www.cybermalveillance.gouv.fr/tous-nos-contenus/fiches-reflexes/hameconnage-phishing'
]

export const networkOf = (id: string): TollNetwork | undefined => NETWORKS.find((n) => n.id === id)

/** "www.sanef.com": where a page is, as the user can check it in the address bar. */
export const hostOf = (url: string) => new URL(url).hostname
