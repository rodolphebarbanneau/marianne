import type { ApprovalLevel, ApprovalRule, ApprovalSettings } from './types'

/**
 * The approval policy: whether an action of Marianne's waits for the user's yes on a card, or was
 * allowed ahead, by the account's level or by a standing permission the user gave with « toujours… »
 * on a card (Réglages › Autorisations). Pure: the main process asks it, then shows the card or the
 * line (main/approvals.ts); the window takes its words.
 *
 * The floor holds at every level: what commits the user (paying, signing, sending, submitting,
 * declaring, certifying, deleting) takes a card for each single action, and nothing is allowed ahead
 * for it. Nor for planning a task, a community service's call, adding a service, or any change to the
 * profile but a deadline. And nothing is allowed ahead in a planned task's run, where nobody would
 * answer a card.
 *
 * A planned task's follow-up the user starts (« payer maintenant ») is their go-ahead, for that turn,
 * to go to its task's sites and fill forms on the sites its service declares (`followUp`): the floor
 * stays whole, and « tout demander » still asks each one.
 */

/** What a tool asks to do. */
export type ApprovalRequest =
  /**
   * Going to a site from a folder. `known`: one of the sites Marianne knows (tools/online.ts).
   * `consented`: what the user already said yes to in this folder, this very site or any.
   * `followUp`: the label of the follow-up the user started this turn with, when its task's sites hold the page.
   */
  | { action: 'online'; site: string; known: boolean; consented: { site: boolean; folder: boolean }; followUp?: string }
  /** Filling a form on a site; `followUp`: as going online, when the follow-up's service declares the page. */
  | { action: 'form'; site: string; known: boolean; followUp?: string }
  /** A change to the profile; `deadline`: adding or updating a deadline, the only one that can be allowed ahead. */
  | { action: 'profile'; deadline: boolean }
  /**
   * Planning a task, a step that commits the user (the floor), a call to a community service nobody
   * reviewed, adding a built-in service Marianne proposes (the user adds it in « avant d’ajouter »).
   */
  | { action: 'task' | 'commit' | 'service' | 'add' }

/** What a standing permission covers: its kind, and the site of one that goes online or fills forms. */
export type Offer = Pick<ApprovalRule, 'action' | 'site'>

export type Verdict =
  /** The user's yes on a card, for this one action. */
  | { by: 'card' }
  /** A planned task's run: no card, nothing allowed ahead, so no. */
  | { by: 'run' }
  /** Going online: the yes the user already gave in this folder. */
  | { by: 'folder' }
  /** Allowed ahead by a standing permission. */
  | { by: 'rule'; rule: ApprovalRule }
  /** Allowed ahead by the « autonomie » level. */
  | { by: 'level' }
  /** Allowed for this turn by the planned task's follow-up the user started (its label). */
  | { by: 'followUp'; label: string }

/** The standing permission a card may offer with « toujours… »; null for what can't be allowed ahead. */
export function offerFor(request: ApprovalRequest): Offer | null {
  if ((request.action === 'online' || request.action === 'form') && request.site) return { action: request.action, site: request.site }
  if (request.action === 'profile' && request.deadline) return { action: 'profile' }
  return null
}

/**
 * Whether a standing permission covers a request: exactly what its card offered. A rule of another
 * kind covers nothing (no card offers one, but the settings are only data): the floor stays whole.
 */
export function covers(rule: ApprovalRule, request: ApprovalRequest): boolean {
  const offer = offerFor(request)
  return !!offer && rule.action === offer.action && (rule.site ?? '') === (offer.site ?? '')
}

/** Whether an action waits for a card, from the account's level and standing permissions; `run`: in a planned task's run. */
export function decide(request: ApprovalRequest, settings: ApprovalSettings, run: boolean): Verdict {
  if (run) return { by: 'run' }
  // A yes given in this folder for this very site holds at every level.
  if (request.action === 'online' && request.consented.site) return { by: 'folder' }
  const rule = settings.rules.find((r) => covers(r, request))
  if (rule) return { by: 'rule', rule }
  // The user's click on a planned task's follow-up: going to its task's sites, and its service's forms, for that
  // turn. A level that asks each new site and each form keeps asking them.
  if ((request.action === 'online' || request.action === 'form') && request.followUp && settings.level !== 'ask')
    return { by: 'followUp', label: request.followUp }
  const autonomous = settings.level === 'autonomous'
  switch (request.action) {
    case 'online':
      if (autonomous && request.known) return { by: 'level' }
      // Any other site: asked once per folder, unless the user wants each new one asked.
      return settings.level !== 'ask' && request.consented.folder ? { by: 'folder' } : { by: 'card' }
    case 'form':
      return autonomous && request.known ? { by: 'level' } : { by: 'card' }
    case 'profile':
      return autonomous && request.deadline ? { by: 'level' } : { by: 'card' }
    default:
      return { by: 'card' }
  }
}

/** A card's « toujours… », and the line of an action it later lets through. */
export function alwaysLabel(offer: Offer): string {
  if (offer.action === 'online') return `toujours pour ${offer.site}`
  if (offer.action === 'form') return `toujours pour les formulaires de ${offer.site}`
  return 'toujours pour les échéances'
}

/** What a standing permission allows, as Réglages › Autorisations lists it. */
export function ruleLabel(rule: Offer): string {
  if (rule.action === 'online') return `aller sur ${rule.site} sans demander`
  if (rule.action === 'form') return `remplir les formulaires de ${rule.site} sans demander`
  return 'enregistrer des échéances dans votre profil sans demander'
}

/** How an action was allowed ahead, as its line says after « autorisé d’office »: the follow-up by its label (« payer maintenant »). */
export function givenLabel(verdict: Extract<Verdict, { by: 'rule' | 'level' | 'followUp' }>): string {
  return verdict.by === 'rule' ? alwaysLabel(verdict.rule) : verdict.by === 'followUp' ? verdict.label : 'autonomie'
}

/** The levels, as Réglages › Autorisations offers them. */
export const LEVELS: Array<{ id: ApprovalLevel; label: string; text: string }> = [
  {
    id: 'ask',
    label: 'tout demander',
    text: 'Marianne vous demande chaque nouveau site de chaque dossier, chaque formulaire et chaque enregistrement dans votre profil.'
  },
  {
    id: 'balanced',
    label: 'équilibré',
    text: 'Marianne vous demande une fois par dossier avant d’aller en ligne, puis chaque formulaire et chaque enregistrement dans votre profil.'
  },
  {
    id: 'autonomous',
    label: 'autonomie',
    text: 'Marianne va sans demander sur les sites qu’elle connaît (les sites publics de sa liste, et ceux où agissent ses services officiels que vous avez activés), y remplit les formulaires et enregistre vos échéances. Les autres sites vous sont demandés une fois par dossier.'
  }
]

/** The floor, in one line on the cards it holds. */
export const FLOOR = 'payer, signer et envoyer attendent toujours votre oui'

/**
 * What the sites a built-in service declares (`sites`) mean for the user, in one line wherever they are
 * shown (« avant d’ajouter », the services table, Marianne's card proposing the service): she clicks
 * the steps on the way there without a card, the floor still asking (tools/browser.ts, click).
 */
export const ON_SITES = 'elle y avance sans vous demander, sauf pour payer, signer ou envoyer'
