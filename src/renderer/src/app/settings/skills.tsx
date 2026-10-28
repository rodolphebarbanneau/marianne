import { useEffect, useState } from 'react'
import type { Config, SkillInfo } from '@shared/types'
import { Action, Check, List, ListRow, Sep } from '../../components/ui'
import type { Update } from '../hooks'

const api = window.marianne

export function Skills({ config, update }: { config: Config; update: Update }) {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  useEffect(() => void api.listSkills().then(setSkills), [config.skills.disabled])

  const toggle = (name: string, enabled: boolean) => {
    const disabled = new Set(config.skills.disabled)
    if (enabled) disabled.delete(name)
    else disabled.add(name)
    void update({ skills: { disabled: [...disabled] } })
  }

  return (
    <>
      <section>
        <Sep tail={<Action onClick={() => void api.listSkills().then(setSkills)}>actualiser</Action>}>compétences</Sep>
        <p className="note" style={{ paddingTop: 0, marginBottom: 8 }}>
          des guides de méthode que l’agent lit avant de traiter un type de demande : comment chercher ses droits, rédiger un courrier, calculer un délai…
        </p>
        <List>
          {skills.map((s) => (
            <ListRow key={s.name} hint={s.description} meta={s.builtin ? 'intégrée' : 'personnelle'} selected={s.enabled}>
              <Check checked={s.enabled} onChange={(v) => toggle(s.name, v)} /> <span className={s.enabled ? 'hi' : 'dim'}>{s.title}</span>{' '}
              <span className="muted">{s.name}</span>
            </ListRow>
          ))}
        </List>
      </section>

      <section>
        <Sep tail={<Action onClick={() => api.openSkillsDir()}>ouvrir le dossier</Action>}>vos compétences</Sep>
        <p className="note">
          ajoutez les vôtres : un fichier .md par compétence dans le dossier skills, avec un en-tête name / title / description, puis la méthode en texte libre.
          une compétence personnelle du même nom remplace la compétence intégrée.
        </p>
        <pre className="note" style={{ fontFamily: 'var(--sharp)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {`---
name: taxe-fonciere
title: Taxe foncière
description: vérifier et contester un avis de taxe foncière
---
1. Demander l'avis et la commune…`}
        </pre>
      </section>
    </>
  )
}
