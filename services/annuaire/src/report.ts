import { plural } from '@marianne/sdk/main'
import { periodText } from './hours'
import type { OfficeAddress, OfficeResults, PublicOffice } from './types'

/** The offices as the model reads them: compact Markdown, with each office's official page and the source to cite. */

export const SOURCE = 'Source: Annuaire de l’administration (DILA), https://lannuaire.service-public.gouv.fr'

const addressText = (a: OfficeAddress) => [...a.lines, `${a.postalCode} ${a.city}`.trim()].filter(Boolean).join(', ')

export function describeOffice(o: PublicOffice): string {
  const visit = [...new Set(o.addresses.filter((a) => !a.postal).map(addressText))]
  const postal = [...new Set(o.addresses.filter((a) => a.postal).map(addressText))].filter((a) => !visit.includes(a))
  const lines = [
    `### ${o.name}`,
    [o.kind && `${o.kind} (${o.kindLabel})`, o.distance !== undefined && `${o.distance} km away`].filter(Boolean).join(' · '),
    ...visit.map((a) => `- Address: ${a}`),
    ...postal.map((a) => `- Postal address: ${a}`),
    o.phones.length && `- Phone: ${o.phones.map((p) => (p.note ? `${p.number} (${p.note})` : p.number)).join('; ')}`,
    o.emails.length && `- Email: ${o.emails.join(', ')}`,
    o.hours.length && `- Hours: ${o.hours.map(periodText).join('; ')}`,
    o.hoursNote && `- About the hours: ${o.hoursNote}`,
    o.websites.length && `- Website: ${o.websites.join(', ')}`,
    o.contactForm && `- Contact form: ${o.contactForm}`,
    o.url && `- Official page: ${o.url}`
  ]
  return lines.filter((l): l is string => !!l).join('\n')
}

/** What was searched and found, then each office. */
export function describeResults(r: OfficeResults): string {
  const shown = r.total > r.offices.length ? `, the first ${r.offices.length} shown` : ''
  const head =
    r.scope === 'commune'
      ? `${plural(r.total, 'office')} in or for ${r.place}${shown}:`
      : r.scope === 'department'
        ? `None listed for ${r.place} itself: ${plural(r.total, 'office')} of its département, the ${r.offices.length} nearest:`
        : `${plural(r.total, 'office')} in all of France${shown}:`
  return [head, '', ...r.offices.map(describeOffice).flatMap((o) => [o, '']), SOURCE].join('\n')
}
