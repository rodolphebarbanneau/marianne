import { useState } from 'react'
import { formatNumber, useHost } from '@marianne/sdk/view'
import type { AssembleeMethods } from '../types'
import { BallotLines } from './ballots'
import { DeputyList, Failure, GroupMark, Loading, shortDate, Star, constituency, useDebounced, useMethod, useNav, useStore } from './common'
import { NeedsData } from './data'

/** The user's deputies, their favorites, and a deputy's or a group's page. */

const VOS_DEPUTES = 'https://www.assemblee-nationale.fr/dyn/vos-deputes'

export function MineTab() {
  const host = useHost<AssembleeMethods>()
  if (!host.home)
    return (
      <div className="box-note">
        Vos députés se trouvent d’après la commune de votre adresse, qui n’est pas encore renseignée.{' '}
        <button className="link" onClick={() => host.openRoute('settings/identity')}>
          renseigner mon adresse
        </button>
      </div>
    )
  return (
    <NeedsData>
      <Mine />
    </NeedsData>
  )
}

function Mine() {
  const host = useHost()
  const mine = useMethod('myDeputies', [])
  if (mine.loading && !mine.data) return <Loading />
  if (mine.error) return <Failure error={mine.error} retry={mine.reload} />
  const commune = mine.data?.commune
  if (!commune) return null
  return (
    <>
      <p className="dim">
        {commune.name} · {commune.departmentName || commune.department} : {mine.data!.deputies.length} députés. Votre circonscription dépend de votre adresse
        exacte :{' '}
        <button className="link" onClick={() => host.openUrl(VOS_DEPUTES)}>
          la vérifier sur le site de l’Assemblée
        </button>
        .
      </p>
      {mine.data!.deputies.length ? <DeputyList deputies={mine.data!.deputies} /> : <p className="dim">Aucun député en exercice pour ce département.</p>}
    </>
  )
}

export function FavoritesTab() {
  return (
    <NeedsData>
      <Favorites />
    </NeedsData>
  )
}

function Favorites() {
  const { favorites } = useStore()
  const [text, setText] = useState('')
  const search = useDebounced(text.trim())
  const starred = useMethod('deputies', favorites.deputies.length ? [{ ids: favorites.deputies }] : null)
  const groups = useMethod('groups', [])
  const found = useMethod('deputies', search.length > 1 ? [/^(\d{1,3}|2[ab])$/i.test(search) ? { department: search } : { text: search, limit: 30 }] : null)
  const nav = useNav()

  return (
    <>
      <div className="box-note">Vos favoris restent privés, dans votre archive. Les scrutins montrent les votes de vos députés et de vos favoris.</div>
      <span className="label">députés suivis</span>
      {!favorites.deputies.length ? (
        <p className="dim">Aucun pour l’instant : ajoutez-en avec ☆, ici ou sur leur fiche.</p>
      ) : starred.error ? (
        <Failure error={starred.error} retry={starred.reload} />
      ) : starred.data ? (
        <DeputyList deputies={starred.data.filter((d) => favorites.deputies.includes(d.id))} />
      ) : (
        <Loading />
      )}
      <div className="assemblee-fields">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="chercher un député : nom ou numéro de département" />
      </div>
      {search.length > 1 &&
        (found.error ? (
          <Failure error={found.error} retry={found.reload} />
        ) : found.data ? (
          found.data.length ? (
            <DeputyList deputies={found.data} />
          ) : (
            <p className="dim">Aucun député en exercice ne correspond.</p>
          )
        ) : (
          <Loading />
        ))}
      <span className="label">groupes politiques</span>
      {groups.error ? (
        <Failure error={groups.error} retry={groups.reload} />
      ) : (
        <div className="assemblee-groups">
          {(groups.data ?? []).map((g) => (
            <div key={g.id} className="assemblee-group">
              <button className="assemblee-open" onClick={() => nav.open({ kind: 'group', id: g.id })}>
                <GroupMark color={g.color} />
                <span className="assemblee-grow">
                  <span className="hi">{g.shortName}</span> <span className="small dim">{g.name}</span>
                </span>
                <span className="small dim">{g.members}</span>
              </button>
              <Star kind="groups" id={g.id} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export function DeputyPane({ id }: { id: string }) {
  const host = useHost()
  const nav = useNav()
  const profile = useMethod('deputy', [id])
  if (profile.loading && !profile.data) return <Loading />
  if (profile.error) return <Failure error={profile.error} retry={profile.reload} />
  const d = profile.data
  if (!d) return null
  const { voted, total } = d.participation
  return (
    <>
      <div className="assemblee-profile">
        <img src={d.photo} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <div className="assemblee-grow">
          <h3 className="hi assemblee-title">
            {d.name} <Star kind="deputies" id={d.id} />
          </h3>
          <p>
            <button className="link" onClick={() => d.groupId && nav.open({ kind: 'group', id: d.groupId })}>
              <GroupMark color={d.groupColor} /> {d.group || 'non inscrit'}
            </button>
          </p>
          <p className="dim">
            {d.department} ({d.departmentNumber}) · {constituency(d.constituency)} · député depuis le {shortDate(d.mandateStart)}
          </p>
          {d.profession && <p className="small dim">{d.profession}</p>}
        </div>
      </div>
      <div className="rows assemblee-facts">
        {d.emails.length > 0 && (
          <div className="row">
            <span className="dim">courriel</span>
            <span>{d.emails.join(', ')}</span>
            <button className="btn small" onClick={() => host.copy(d.emails[0], 'adresse copiée')}>
              copier
            </button>
          </div>
        )}
        {d.office && (
          <div className="row">
            <span className="dim">permanence</span>
            <span>{d.office}</span>
            <span />
          </div>
        )}
        {d.websites.map((site) => (
          <div key={site} className="row">
            <span className="dim">site</span>
            <span>{site}</span>
            <button className="btn small" onClick={() => host.openUrl(/^https?:/.test(site) ? site : `https://${site}`)}>
              ouvrir
            </button>
          </div>
        ))}
        {d.hatvp && (
          <div className="row">
            <span className="dim">déclarations d’intérêts</span>
            <span>Haute Autorité pour la transparence de la vie publique</span>
            <button className="btn small" onClick={() => host.openUrl(d.hatvp)}>
              ouvrir
            </button>
          </div>
        )}
      </div>
      {d.roles.length > 0 && (
        <>
          <span className="label">fonctions</span>
          <ul className="assemblee-roles">
            {d.roles.map((r) => (
              <li key={r.organId}>
                <span className="accent">{r.role}</span> · {r.organ}
              </li>
            ))}
          </ul>
        </>
      )}
      <span className="label">votes</span>
      <p>
        A pris part à {formatNumber(voted)} des {formatNumber(total)} scrutins publics depuis le début de son mandat.{' '}
        <span className="small dim">Les votes à main levée ne sont pas nominatifs ; une absence peut tenir à des travaux en commission au même moment.</span>
      </p>
      {total > 0 && (
        <span className="gauge assemblee-gauge">
          <i style={{ width: `${Math.min(100, (voted / total) * 100)}%` }} />
        </span>
      )}
      <BallotLines ballots={d.votes} showPosition />
      <p className="assemblee-actions">
        <button className="btn small" onClick={() => nav.searchVideos({ speaker: `${d.lastName} ${d.firstName}` })}>
          ses interventions en vidéo
        </button>
        <button
          className="btn small"
          onClick={() =>
            host.ask(
              `Que fait ${d.name}, député${d.department ? ` (${d.department}, ${constituency(d.constituency)})` : ''} ? Ses fonctions, ses votes récents et ses prises de position. ${d.url}`
            )
          }
        >
          demander à Marianne
        </button>
        <button className="btn small" onClick={() => host.openUrl(d.url)}>
          page officielle
        </button>
      </p>
    </>
  )
}

export function GroupPane({ id }: { id: string }) {
  const group = useMethod('group', [id])
  if (group.loading && !group.data) return <Loading />
  if (group.error) return <Failure error={group.error} retry={group.reload} />
  if (!group.data) return null
  const { group: g, members } = group.data
  return (
    <>
      <h3 className="hi assemblee-title">
        <GroupMark color={g.color} /> {g.name} <span className="dim">({g.shortName})</span> <Star kind="groups" id={g.id} />
      </h3>
      <p className="dim">{members.length} députés</p>
      <DeputyList deputies={members} />
    </>
  )
}
