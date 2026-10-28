import * as z from 'zod'
import { actorNumber, fold, POSITION_CODES, type Depute, type Scrutin } from '../data/assemblee'
import { ftsQuery } from '../data/db'
import { sync } from '../data/sync'
import { hms, liveStreams, searchVideos, videoDetail } from '../data/videos'
import { plural, table, tool, ToolError } from './tool'

/**
 * Assemblée nationale: deputies and votes from the local index of the open data dumps, videos
 * and live streams from the video portal.
 */

function ensureIndexed(): void {
  if (!sync.ready('assemblee'))
    throw new ToolError(
      "Les données de l'Assemblée ne sont pas encore indexées (premier téléchargement en cours ou source désactivée). Propose à l'utilisateur de lancer la mise à jour dans réglages → sources."
    )
}

interface DeputeRow {
  id: string
  data: string
  groupe: string | null
  groupe_abrege: string | null
}

/** Stored position code → label. */
const position = (code: number) => ({ pour: 'pour', contre: 'contre', abstention: 'abstention', nonVotant: 'non-votant' })[POSITION_CODES[code]] ?? '?'
const deputyPage = (id: string) => `https://www.assemblee-nationale.fr/dyn/deputes/${id}`
const legislature = (scrutinId: string) => scrutinId.match(/L(\d+)V/)?.[1] ?? '17'
const scrutinPage = (s: { id: string; numero: number }) => `https://www.assemblee-nationale.fr/dyn/${legislature(s.id)}/scrutins/${s.numero}`
const ordinal = (circo: string) => (circo === '1' ? '1re' : `${circo}e`)

/** Deputies matching every word of `text` (name, department name or number). */
function findDeputies(text: string, limit = 20): DeputeRow[] {
  const words = fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  if (/^PA\d+$/i.test(text.trim()))
    return sync.db
      .prepare(
        'select d.id, d.data, o.libelle as groupe, o.abrege as groupe_abrege from an_deputes d left join an_organes o on o.id = d.groupe_id where d.id = ?'
      )
      .all(text.trim().toUpperCase()) as unknown as DeputeRow[]
  return sync.db
    .prepare(
      `select d.id, d.data, o.libelle as groupe, o.abrege as groupe_abrege from an_deputes d left join an_organes o on o.id = d.groupe_id
       where ${words.map(() => `(' ' || d.search || ' ') like ?`).join(' and ') || '1'} order by d.nom limit ?`
    )
    .all(...words.map((w) => `%${w}%`), limit) as unknown as DeputeRow[]
}

function oneDeputy(text: string): DeputeRow {
  const found = findDeputies(text, 5)
  if (!found.length) throw new ToolError(`Aucun député en exercice ne correspond à « ${text} ».`)
  if (found.length > 1) {
    const names = found.map((r) => {
      const d = JSON.parse(r.data) as Depute
      return `${d.prenom} ${d.nom} (${r.id}, ${d.departement})`
    })
    throw new ToolError(`Plusieurs députés correspondent : ${names.join(' ; ')}. Précise, ou donne l'identifiant PA….`)
  }
  return found[0]
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export const assembleeTools = [
  tool({
    name: 'deputes',
    title: 'Assemblée · députés',
    source: 'assemblee',
    readOnly: true,
    description:
      "Liste les députés en exercice : par nom, par département (nom ou numéro), par circonscription ou par groupe politique (sigle ou nom). Pour trouver « mon député », demande le département et la circonscription, ou la commune (la circonscription se vérifie sur le site de l'Assemblée).",
    input: {
      recherche: z.string().optional().describe('Nom, ou département (nom ou numéro), ex. "Gironde", "33", "Dupont"'),
      circonscription: z.string().optional().describe('Numéro de circonscription dans le département'),
      groupe: z.string().optional().describe('Sigle ou nom du groupe, ex. "SOC", "écologiste"'),
      limite: z.number().int().min(1).max(100).default(30)
    },
    run: async ({ recherche, circonscription, groupe, limite }) => {
      ensureIndexed()
      let rows = findDeputies(recherche ?? '', 600)
      if (recherche && /^\d{1,3}$|^2[ab]$/i.test(recherche.trim())) {
        const dep = recherche.trim().toUpperCase().padStart(2, '0')
        rows = rows.filter((r) => (JSON.parse(r.data) as Depute).numDepartement.toUpperCase().padStart(2, '0') === dep)
      }
      if (circonscription) rows = rows.filter((r) => (JSON.parse(r.data) as Depute).circo === circonscription.trim())
      if (groupe) {
        const g = fold(groupe)
        rows = rows.filter((r) => fold(`${r.groupe_abrege ?? ''} ${r.groupe ?? ''}`).includes(g))
      }
      if (!rows.length) throw new ToolError('Aucun député ne correspond.')
      const shown = rows.slice(0, limite)
      return `${plural(rows.length, 'député')}${rows.length > shown.length ? ` (les ${shown.length} premiers)` : ''} :\n\n${table(
        ['député', 'groupe', 'département', 'circonscription', 'id'],
        shown.map((r) => {
          const d = JSON.parse(r.data) as Depute
          return [`${d.civ} ${d.prenom} ${d.nom}`, r.groupe_abrege ?? '', `${d.departement} (${d.numDepartement})`, ordinal(d.circo), r.id]
        })
      )}`
    }
  }),

  tool({
    name: 'depute',
    title: 'Assemblée · député',
    source: 'assemblee',
    readOnly: true,
    description:
      'Fiche d’un député : groupe, circonscription, commissions et fonctions, contacts (courriel, permanence), déclaration d’intérêts (HATVP), participation aux scrutins et ses derniers votes.',
    input: { depute: z.string().describe('Nom ou identifiant PA…') },
    run: async ({ depute }) => {
      ensureIndexed()
      const row = oneDeputy(depute)
      const d = JSON.parse(row.data) as Depute
      const organ = sync.db.prepare('select libelle, type from an_organes where id = ?')
      const roles = d.organes
        .map((o) => ({ ...(organ.get(o.id) as { libelle: string; type: string } | undefined), qualite: o.qualite }))
        .filter(
          (o) =>
            o.libelle &&
            ['COMPER', 'COMSPSENAT', 'CMP', 'MISINFO', 'MISINFOCOM', 'DELEG', 'DELEGBUREAU', 'BUREAU', 'CNPE', 'OFFPAR', 'GE', 'CONFPT'].includes(o.type ?? '')
        )
        .map((o) => `- ${o.qualite} · ${o.libelle}`)
      const votes = sync.db
        .prepare(
          `select s.id, s.numero, s.date, s.titre, s.sort, v.position, v.delegation from an_votes v join an_scrutins s on s.numero = v.scrutin
           where v.acteur = ? order by s.date desc, s.numero desc limit 12`
        )
        .all(actorNumber(row.id)) as Array<{ id: string; numero: number; date: string; titre: string; sort: string; position: number; delegation: number }>
      const { voted } = sync.db.prepare('select count(*) as voted from an_votes where acteur = ? and position != 3').get(actorNumber(row.id)) as {
        voted: number
      }
      const { total } = sync.db.prepare('select count(*) as total from an_scrutins where date >= ?').get(d.mandatDebut) as { total: number }
      return [
        `# ${d.civ} ${d.prenom} ${d.nom}`,
        `${row.groupe ?? 'non inscrit'}${row.groupe_abrege ? ` (${row.groupe_abrege})` : ''} · ${ordinal(d.circo)} circonscription · ${d.departement} (${d.numDepartement}) · député depuis le ${d.mandatDebut}`,
        `${d.profession ? `profession : ${d.profession} · ` : ''}né(e) le ${d.dateNaissance}`,
        `fiche : ${deputyPage(row.id)}${d.hatvp ? ` · déclarations d'intérêts : ${d.hatvp}` : ''}`,
        d.emails.length ? `courriel : ${d.emails.join(', ')}` : '',
        d.permanence ? `permanence : ${d.permanence}` : '',
        d.sites.length ? `site : ${d.sites.join(', ')}` : '',
        roles.length ? `\n## Fonctions\n\n${roles.join('\n')}` : '',
        `\n## Votes\n\nA pris part à ${voted} des ${total} scrutins publics depuis le début de son mandat (les votes non nominatifs, à main levée, ne sont pas comptés).\n`,
        votes.length
          ? table(
              ['date', 'scrutin', 'objet', 'résultat', 'vote'],
              votes.map((v) => [v.date, `n° ${v.numero}`, v.titre.slice(0, 120), v.sort, `${position(v.position)}${v.delegation ? ' (délégation)' : ''}`])
            )
          : ''
      ]
        .filter(Boolean)
        .join('\n')
    }
  }),

  tool({
    name: 'scrutins',
    title: 'Assemblée · scrutins',
    source: 'assemblee',
    readOnly: true,
    description:
      "Cherche les scrutins publics de l'Assemblée (votes sur les textes, articles, amendements, motions) par mots-clés et dates, avec le résultat ; avec un député, donne aussi son vote sur chacun. Utile pour « comment a voté mon député sur… ».",
    input: {
      recherche: z.string().optional().describe('Mots du titre, ex. "retraites", "loi de finances 2027 ensemble"'),
      depute: z.string().optional().describe('Nom ou identifiant PA… : montre son vote'),
      depuis: z.string().optional().describe('AAAA-MM-JJ'),
      jusqua: z.string().optional().describe('AAAA-MM-JJ'),
      ensembles: z.boolean().default(false).describe('Seulement les votes sur l’ensemble d’un texte'),
      limite: z.number().int().min(1).max(50).default(15)
    },
    run: async ({ recherche, depute, depuis, jusqua, ensembles, limite }) => {
      ensureIndexed()
      const deputy = depute ? oneDeputy(depute) : null
      const where: string[] = []
      const args: Array<string | number> = []
      let from = 'an_scrutins s'
      const q = recherche ? ftsQuery(recherche) : ''
      if (q) {
        from = 'an_scrutins_fts f join an_scrutins s on s.rowid = f.rowid'
        where.push('an_scrutins_fts match ?')
        args.push(q)
      }
      if (depuis) {
        where.push('s.date >= ?')
        args.push(depuis)
      }
      if (jusqua) {
        where.push('s.date <= ?')
        args.push(jusqua)
      }
      if (ensembles) where.push("s.titre like '%ensemble%'")
      const sql = `select s.id, s.numero, s.date, s.titre, s.sort${deputy ? ', (select position from an_votes v where v.scrutin = s.numero and v.acteur = ?) as position' : ''}
        from ${from} ${where.length ? `where ${where.join(' and ')}` : ''} order by s.date desc, s.numero desc limit ?`
      const rows = sync.db.prepare(sql).all(...(deputy ? [actorNumber(deputy.id)] : []), ...args, limite) as Array<{
        id: string
        numero: number
        date: string
        titre: string
        sort: string
        position?: number | null
      }>
      if (!rows.length) return `Aucun scrutin trouvé${recherche ? ` pour « ${recherche} »` : ''}.`
      const name = deputy ? (JSON.parse(deputy.data) as Depute) : null
      return `${plural(rows.length, 'scrutin')}${name ? ` · vote de ${name.prenom} ${name.nom}` : ''} :\n\n${table(
        ['date', 'n°', 'objet', 'résultat', ...(name ? ['vote'] : []), 'lien'],
        rows.map((r) => [
          r.date,
          r.numero,
          r.titre.slice(0, 160),
          r.sort,
          ...(name ? [r.position !== null && r.position !== undefined ? position(r.position) : 'absent'] : []),
          scrutinPage(r)
        ])
      )}`
    }
  }),

  tool({
    name: 'scrutin',
    title: 'Assemblée · scrutin',
    source: 'assemblee',
    readOnly: true,
    description: 'Détail d’un scrutin public : objet, résultat, décompte, position de chaque groupe politique, et le vote d’un député si demandé.',
    input: { numero: z.union([z.number().int(), z.string()]).describe('Numéro du scrutin ou identifiant VTANR5L17V…'), depute: z.string().optional() },
    run: async ({ numero, depute }) => {
      ensureIndexed()
      const key = String(numero).trim()
      const row = (
        /^VT/i.test(key)
          ? sync.db.prepare('select data from an_scrutins where id = ?').get(key.toUpperCase())
          : sync.db.prepare('select data from an_scrutins where numero = ? order by date desc').get(Number(key))
      ) as { data: string } | undefined
      if (!row) throw new ToolError(`Scrutin ${key} introuvable.`)
      const s = JSON.parse(row.data) as Scrutin
      const organ = sync.db.prepare('select libelle, abrege from an_organes where id = ?')
      const groups = s.groupes.map((g) => {
        const o = organ.get(g.organeId) as { libelle: string; abrege: string } | undefined
        return [o?.abrege || o?.libelle || g.organeId, g.membres, g.position, g.pour, g.contre, g.abstentions, g.nonVotants]
      })
      let mine = ''
      if (depute) {
        const d = oneDeputy(depute)
        const v = sync.db.prepare('select position, delegation from an_votes where scrutin = ? and acteur = ?').get(s.numero, actorNumber(d.id)) as
          { position: number; delegation: number } | undefined
        const p = JSON.parse(d.data) as Depute
        mine = `\n\nVote de ${p.prenom} ${p.nom} : **${v ? `${position(v.position)}${v.delegation ? ' (par délégation)' : ''}` : 'n’a pas pris part au vote'}**`
      }
      return `# Scrutin n° ${s.numero} du ${s.date}\n\n${s.titre}\n\n${s.type} · **${s.sort}** · ${s.votants} votants : ${s.pour} pour, ${s.contre} contre, ${s.abstentions} abstentions\n${scrutinPage(s)}${mine}\n\n${table(['groupe', 'membres', 'position majoritaire', 'pour', 'contre', 'abstentions', 'non-votants'], groups)}`
    }
  }),

  tool({
    name: 'videos_assemblee',
    title: 'Assemblée · vidéos',
    source: 'assemblee',
    readOnly: true,
    description:
      "Liste les vidéos de l'Assemblée nationale (séances publiques, commissions, questions au gouvernement) sur une période, avec filtre par mots du titre ou par orateur. Donne leurs liens videos.assemblee-nationale.fr : cités dans ta réponse, Marianne les affiche comme lecteurs vidéo. Les vidéos restent en ligne environ un an.",
    input: {
      du: z.string().optional().describe('AAAA-MM-JJ (défaut : il y a 7 jours)'),
      au: z.string().optional().describe('AAAA-MM-JJ (défaut : aujourd’hui)'),
      type: z.enum(['seance', 'commission', 'questions', 'autre']).optional(),
      recherche: z.string().optional().describe('Mots du titre ou de la description, ex. "budget santé"'),
      orateur: z.string().optional().describe('« Nom Prénom » d’un orateur'),
      limite: z.number().int().min(1).max(60).default(15)
    },
    run: async ({ du, au, type, recherche, orateur, limite }) => {
      const videos = await searchVideos({ from: du ?? daysAgo(7), to: au ?? daysAgo(0), type, text: recherche, speaker: orateur })
      if (!videos.length) return 'Aucune vidéo publiée sur cette période avec ces critères. Élargis la période ou retire un filtre.'
      return `${plural(videos.length, 'vidéo')}${videos.length > limite ? ` (les ${limite} plus récentes)` : ''} :\n\n${videos
        .slice(0, limite)
        .map((v) => `- ${v.date.slice(0, 16).replace('T', ' ')} · ${v.type}${v.commission ? ` (${v.commission})` : ''} · **${v.title}**\n  ${v.url}`)
        .join('\n')}`
    }
  }),

  tool({
    name: 'video_assemblee',
    title: 'Assemblée · vidéo',
    source: 'assemblee',
    readOnly: true,
    description:
      "Détail d'une vidéo de l'Assemblée : durée, organe, ordre du jour découpé en chapitres avec l'horodatage de chaque intervention et l'orateur (avec son identifiant de député). Pour renvoyer à un passage, cite le lien de la vidéo suivi de ?timecode=<millisecondes>.",
    input: { id: z.string().describe('Identifiant "19632460_6ae0ce76adf9c" ou lien de la vidéo') },
    run: async ({ id }) => {
      const key = id.match(/(\d+_[0-9a-f]+)/i)?.[1]
      if (!key) throw new ToolError('Identifiant de vidéo invalide.')
      const v = await videoDetail(key)
      const chapters = v.chapters
        .map(
          (c) =>
            `${'  '.repeat(c.depth)}- ${c.timecode !== null ? `[${hms(c.timecode)}](${v.url}?timecode=${c.timecode}) ` : ''}${c.title}${c.deputy ? ` (${c.deputy})` : ''}`
        )
        .join('\n')
      return `# ${v.title}\n\n${v.date.slice(0, 16).replace('T', ' ')} · ${v.type}${v.organ ? ` · ${v.organ}` : ''} · durée ${hms(v.durationMs)}${v.meetingId ? ` · réunion ${v.meetingId}` : ''}\n${v.url}\n\n## Chapitres\n\n${chapters || '(non chapitrée)'}`
    }
  }),

  tool({
    name: 'direct_assemblee',
    title: 'Assemblée · en direct',
    source: 'assemblee',
    readOnly: true,
    description: "Les séances et réunions de l'Assemblée diffusées en direct en ce moment.",
    input: {},
    run: async () => {
      const live = await liveStreams()
      if (!live.length) return 'Aucune diffusion en direct en ce moment.'
      return (
        live.map((l) => `- ${l.organ} · depuis ${l.start}\n  ${l.subject}`).join('\n') + "\n\nL'utilisateur peut les regarder dans Marianne, section assemblée."
      )
    }
  })
]
