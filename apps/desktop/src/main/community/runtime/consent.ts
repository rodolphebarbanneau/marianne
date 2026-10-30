import { serviceCode, type ServiceManifest, type ServiceTrust } from '@marianne/sdk'
import { ToolError } from '@marianne/sdk/main'
import type { ApprovalPart } from '../../../shared/types'
import type { Decision } from '../../approvals'

/**
 * Before a community service nobody reviewed receives anything: the user sees exactly what would
 * leave, on a card in the conversation, and says yes. Nothing can tell whether a model sends a tool
 * more than the request needs; for a service the catalogue vouches for, the review stands in for
 * that, and here the user does. No answer, or no conversation to show the card in, is a no.
 */

type Card = Omit<ApprovalPart, 'type' | 'id' | 'status'>
export type AskUser = (folderId: string | undefined, card: Card) => Promise<Decision>

const TRUST_LABEL: Record<Exclude<ServiceTrust, 'validated'>, string> = {
  unvalidated: 'non validé',
  outside: 'hors catalogue',
  withdrawn: 'retiré du catalogue'
}

/** One line of the card per argument, its value as it would be sent. */
const shown = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value))

export function consentCard(
  manifest: ServiceManifest,
  tool: { label: string },
  trust: Exclude<ServiceTrust, 'validated'>,
  args: Record<string, unknown>
): Card {
  return {
    kind: 'service',
    title: `Envoyer à 3615 ${serviceCode(manifest).toUpperCase()} ?`,
    reason: `Personne n’a relu ce service (${TRUST_LABEL[trust]}). Il recevrait exactement ceci, et pourrait le garder.`,
    fields: [{ label: 'outil', value: tool.label }, ...Object.entries(args).map(([label, value]) => ({ label, value: shown(value) }))]
  }
}

/** Resolves when the arguments may go; throws for the model to read otherwise. A call with nothing to send has nothing to ask. */
export async function askConsent(
  ask: AskUser,
  folderId: string | undefined,
  manifest: ServiceManifest,
  tool: { label: string },
  trust: ServiceTrust,
  args: Record<string, unknown>
): Promise<void> {
  if (trust === 'validated' || Object.keys(args).length === 0) return
  const decision = await ask(folderId, consentCard(manifest, tool, trust, args))
  const service = `3615 ${serviceCode(manifest).toUpperCase()}`
  if (decision === 'refused') throw new ToolError(`The user refused: nothing was sent to ${service}. Do not send it again unless they ask.`)
  if (decision === 'expired') throw new ToolError(`No answer from the user (or no conversation to show the card in): nothing was sent to ${service}.`)
}
