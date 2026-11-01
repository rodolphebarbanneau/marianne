import { PROFILE_FIELD_SHORT, type ServiceTrust } from '@marianne/sdk'
import { ON_SITES } from '@shared/approvals'
import { highlight, type Listing } from './model'

/** Pieces the Services page shows in its tiles, rows and cards: always the same words for the same things. */

/** The words typed, lit in a text. */
export function Lit({ text, terms }: { text: string; terms?: string[] }) {
  if (!terms?.length) return <>{text}</>
  return <>{highlight(text, terms).map((part, i) => (part.mark ? <mark key={i}>{part.text}</mark> : part.text))}</>
}

/** A service's code, as it follows 3615: METEO. */
export function Code({ code, terms }: { code: string; terms?: string[] }) {
  return (
    <span className="code">
      <Lit text={code.toUpperCase()} terms={terms} />
    </span>
  )
}

/** « officiel », with the tricolour: shipped with Marianne. */
export function Official() {
  return (
    <span className="origin official" title="livré avec Marianne">
      <span className="tricolor" aria-hidden>
        <i style={{ background: 'var(--bleu)' }} />
        <i style={{ background: 'var(--blanc)' }} />
        <i style={{ background: 'var(--rouge)' }} />
      </span>
      officiel
    </span>
  )
}

/** « communauté », dashed yellow: published by the community, not by Marianne. */
export function Community() {
  return (
    <span className="origin community" title="publié par la communauté, pas par Marianne">
      communauté
    </span>
  )
}

const TRUST: Record<ServiceTrust, { label: string; title: string; ok: boolean }> = {
  validated: { label: '✓ validé', title: 'relu et validé par Marianne : cette version est signée', ok: true },
  unvalidated: { label: 'non validé', title: 'dans le dépôt de la communauté, pas encore relu par Marianne', ok: false },
  outside: { label: '⚠ hors catalogue', title: 'ajouté depuis un fichier qui n’est pas dans le dépôt de la communauté', ok: false },
  withdrawn: { label: '⚠ validation retirée', title: 'Marianne a retiré la validation de cette version : le service est désactivé', ok: false }
}

/** A community service's standing: validated, not validated, outside the catalogue, withdrawn. */
export function TrustMark({ trust }: { trust: ServiceTrust }) {
  const t = TRUST[trust]
  return (
    <span className={t.ok ? 'trust-ok' : 'trust-warn'} title={t.title}>
      {t.label}
    </span>
  )
}

/** Where a service comes from, and for a community one, its standing. `inline`: side by side rather than stacked. */
export function Origin({ listing, inline }: { listing: Pick<Listing, 'official' | 'trust'>; inline?: boolean }) {
  if (listing.official) return <Official />
  return (
    <span className={inline ? 'row-flex' : 'stack'} style={inline ? { gap: 6, flexWrap: 'nowrap' } : { gap: 3, alignItems: 'flex-start' }}>
      <Community />
      {listing.trust && (
        <span className="small">
          <TrustMark trust={listing.trust} />
        </span>
      )}
    </span>
  )
}

/** "1 site", "2 sites", "aucun site". */
export const sites = (hosts: string[]) => (hosts.length ? `${hosts.length} site${hosts.length > 1 ? 's' : ''}` : 'aucun site')

/**
 * What a service reaches, where Marianne acts for it, and what it reads: "2 sites", "Marianne agit sur 1 site", "lit : vos plaques".
 * Next to where Marianne acts, what the service reaches says it is its own: « aucun site de lui-même ».
 */
export function Access({ listing }: { listing: Pick<Listing, 'hosts' | 'sites' | 'reads'> }) {
  const reads = listing.reads.map((f) => PROFILE_FIELD_SHORT[f])
  return (
    <span className="stack" style={{ gap: 2 }}>
      <span className="dim" title={listing.hosts.join(', ')}>
        {sites(listing.hosts)}
        {listing.sites.length > 0 && ' de lui-même'}
      </span>
      {listing.sites.length > 0 && (
        <span className="small" title={`Marianne pourra agir pour vous sur : ${listing.sites.join(', ')} · ${ON_SITES}`}>
          Marianne agit sur {sites(listing.sites)}
        </span>
      )}
      <span className={`small${reads.length ? '' : ' muted'}`}>lit : {reads.length ? reads.join(', ') : 'rien'}</span>
    </span>
  )
}
