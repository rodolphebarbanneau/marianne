import { useState } from 'react'
import { Modal, useHost } from '@marianne/sdk/view'
import { videoPage } from '../links'
import { clock } from '../time'
import type { Clip } from '../types'
import { shortDate, useNav, useStore } from './common'

/** « mes extraits »: the passages the user kept, in their archive. */

export function ClipsTab() {
  const host = useHost()
  const nav = useNav()
  const { clips, setClips } = useStore()
  const [removing, setRemoving] = useState<Clip | null>(null)

  if (!clips.length)
    return (
      <div className="box-note">
        Aucun extrait pour l’instant. Dans une vidéo, « découper un extrait » garde un passage ici, privé, dans votre archive : pour le revoir, le partager ou
        en parler avec Marianne.
      </div>
    )
  return (
    <>
      <div className="parlement-clips">
        {clips.map((c) => (
          <div key={c.id} className="parlement-clip">
            <button className="parlement-thumb" onClick={() => nav.open({ kind: 'video', id: c.video, start: c.start, stopAt: c.end })}>
              {c.thumbnail ? (
                <img src={c.thumbnail} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              ) : (
                <span className="parlement-noimg" />
              )}
            </button>
            <span className="parlement-grow">
              <span className="hi">{c.title}</span>
              <span className="small dim">
                {c.videoTitle} · {shortDate(c.date)} · {clock(c.start)} → {clock(c.end)}
              </span>
            </span>
            <span className="parlement-acts">
              <button className="btn small" onClick={() => nav.open({ kind: 'video', id: c.video, start: c.start, stopAt: c.end })}>
                regarder
              </button>
              <button className="btn small" onClick={() => nav.open({ kind: 'video', id: c.video, start: c.start, clip: c.id })}>
                découper
              </button>
              <button className="btn small" onClick={() => host.copy(videoPage(c.video, c.start), 'lien copié')}>
                copier le lien
              </button>
              <button
                className="btn small"
                onClick={() =>
                  host.ask(
                    `Que dit ce passage d’une vidéo de l’Assemblée nationale (« ${c.title} », de ${clock(c.start)} à ${clock(c.end)}) ? ${videoPage(c.video, c.start)}`
                  )
                }
              >
                demander à Marianne
              </button>
              <button className="btn small danger" onClick={() => setRemoving(c)}>
                supprimer
              </button>
            </span>
          </div>
        ))}
      </div>
      {removing && (
        <Modal onClose={() => setRemoving(null)}>
          <div className="in">
            <span className="label">supprimer l’extrait</span>
            <p>
              « {removing.title} » ({clock(removing.start)} → {clock(removing.end)}) sera retiré de vos extraits. La vidéo reste sur le portail de l’Assemblée.
            </p>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setRemoving(null)}>
              annuler
            </button>
            <button
              className="btn danger"
              onClick={() => {
                setClips(clips.filter((c) => c.id !== removing.id))
                setRemoving(null)
              }}
            >
              supprimer
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
