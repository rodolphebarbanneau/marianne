import { formatNumber } from '@marianne/sdk'
import { clip, plural, table } from '@marianne/sdk/main'
import { videoPage } from './links'
import { clock, parisTime } from './time'
import type { AgendaMeeting, BallotDetail, BallotSummary, DeputyCard, DeputyProfile, LiveStream, Position, VideoDetail, VideoItem } from './types'

/** The tools' results: compact Markdown in English, for the model, with the links and ids it needs to cite. */

const POSITIONS: Record<Position, string> = { for: 'for', against: 'against', abstention: 'abstention', nonVoting: 'non-voting' }

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text)

const vote = (position: Position | null | undefined, proxy?: boolean) =>
  position ? `${POSITIONS[position]}${proxy ? ' (by proxy)' : ''}` : 'did not take part'

const department = (d: Pick<DeputyCard, 'department' | 'departmentNumber'>) => `${d.department} (${d.departmentNumber})`

/** "2026-10-28 14:00", Paris time. */
const when = (iso: string) => (iso ? `${iso.slice(0, 10)} ${parisTime(iso)}` : '')

export function formatDeputies(cards: DeputyCard[], limit: number, scope = ''): string {
  const shown = cards.slice(0, limit)
  const head = `${plural(cards.length, 'sitting deputy', 'sitting deputies')}${scope ? ` · ${scope}` : ''}${cards.length > shown.length ? ` (the first ${shown.length})` : ''}:`
  return `${head}\n\n${table(
    ['deputy', 'group', 'département', 'constituency', 'id'],
    shown.map((d) => [d.name, d.groupShort || 'non-attached', department(d), d.constituency, d.id])
  )}`
}

export function formatDeputy(p: DeputyProfile): string {
  const facts = [
    `${p.group ? `${p.group}${p.groupShort ? ` (${p.groupShort})` : ''}` : 'non-attached'} · ${department(p)}, constituency ${p.constituency} · deputy since ${p.mandateStart}`,
    [p.profession && `profession: ${p.profession}`, p.birthDate && `born ${p.birthDate}`].filter(Boolean).join(' · '),
    `page: ${p.url}${p.hatvp ? ` · declarations of interests (HATVP): ${p.hatvp}` : ''}`,
    p.emails.length ? `email: ${p.emails.join(', ')}` : '',
    p.office ? `constituency office: ${p.office}` : '',
    p.websites.length ? `websites: ${p.websites.join(', ')}` : ''
  ]
  const lines = [`# ${p.name} (${p.id})`, '', ...facts.filter(Boolean)]
  if (p.roles.length) lines.push('', '## Roles', '', ...p.roles.map((r) => `- ${r.role} · ${r.organ}`))
  const { voted, total } = p.participation
  lines.push(
    '',
    '## Votes',
    '',
    `Took part in ${formatNumber(voted)} of the ${formatNumber(total)} public ballots since the start of the mandate (votes by show of hands are not recorded by name).`
  )
  if (p.votes.length) {
    lines.push(
      '',
      table(
        ['date', 'ballot', 'subject', 'result', 'vote'],
        p.votes.map((v) => [v.date, `no. ${v.number}`, cut(v.title, 120), v.result, vote(v.position, v.proxy)])
      )
    )
  }
  return lines.join('\n')
}

export function formatBallots(rows: BallotSummary[], deputy?: string): string {
  return `${plural(rows.length, 'public ballot')}${deputy ? ` · with the vote of ${deputy}` : ''}, newest first:\n\n${table(
    ['date', 'no.', 'subject', 'result', ...(deputy ? ['vote'] : []), 'link'],
    rows.map((r) => [r.date, r.number, cut(r.title, 160), r.result, ...(deputy ? [vote(r.position, r.proxy)] : []), r.url])
  )}`
}

export function formatBallot(b: BallotDetail): string {
  const lines = [
    `# Ballot no. ${b.number} of ${b.date} (${b.id})`,
    '',
    b.title,
    ...(b.billTitle ? [`legislative file: ${b.billTitle}${b.bill ? ` (${b.bill})` : ''}`] : []),
    '',
    `${b.type} · **${b.result}** · ${formatNumber(b.voters)} voters: ${formatNumber(b.for)} for, ${formatNumber(b.against)} against, ${formatNumber(b.abstentions)} abstentions`,
    b.url
  ]
  for (const v of b.votes) lines.push('', `Vote of ${v.deputy.name} (${v.deputy.id}): **${vote(v.position, v.proxy)}**`)
  if (b.groups.length) {
    lines.push(
      '',
      table(
        ['group', 'members', 'majority position', 'for', 'against', 'abstentions', 'non-voting'],
        b.groups.map((g) => [g.shortName || g.name, g.members, g.position ? POSITIONS[g.position] : '', g.for, g.against, g.abstentions, g.nonVoting])
      )
    )
  }
  return lines.join('\n')
}

const STATES = { confirmed: '', tentative: 'tentative', cancelled: 'CANCELLED' }

export function formatAgenda(day: string, meetings: AgendaMeeting[]): string {
  if (!meetings.length) return `Nothing on the agenda of the Assemblée nationale on ${day}.`
  const lines = meetings.map((m) => {
    const head = [
      parisTime(m.start) + (m.end ? `–${parisTime(m.end)}` : ''),
      m.kind === 'sitting' ? '**Public sitting**' : `**${m.organ || 'Meeting'}**`,
      m.live ? 'LIVE NOW' : '',
      STATES[m.state],
      m.kind === 'sitting' ? '' : m.place,
      m.video ? 'filmed' : '',
      `id ${m.id}`
    ].filter(Boolean)
    const items = m.items.slice(0, 8).map((item) => `  - ${cut(item, 240)}`)
    return [`- ${head.join(' · ')}`, ...items, ...(m.items.length > 8 ? [`  - … ${m.items.length - 8} more items`] : [])].join('\n')
  })
  return clip(`# Agenda of the Assemblée nationale, ${day} (Paris time)\n\n${lines.join('\n')}`, 12_000, 'Narrow it down with kind or text.')
}

export function formatVideos(videos: VideoItem[], limit: number): string {
  const shown = videos.slice(0, limit)
  return `${plural(videos.length, 'video')}${videos.length > shown.length ? ` (the ${shown.length} most recent)` : ''}:\n\n${shown
    .map(
      (v) =>
        `- ${when(v.date)} · ${v.type}${v.commission ? ` (${v.commission})` : ''} · **${v.title}**${v.timecode ? ` · passage at ${clock(v.timecode)}` : ''}\n  ${v.url}`
    )
    .join('\n')}`
}

export function formatVideo(v: VideoDetail): string {
  const chapters = v.chapters
    .map(
      (c) =>
        `${'  '.repeat(c.depth)}- ${c.timecode !== null ? `[${clock(c.timecode)}](${videoPage(v.id, c.timecode)}) ` : ''}${c.title}${c.deputy ? ` (${c.deputy})` : ''}`
    )
    .join('\n')
  const head = [
    when(v.date),
    v.type,
    v.organ,
    v.durationMs ? `duration ${clock(v.durationMs)}` : '',
    v.meetingIds.length ? `meeting ${v.meetingIds.join(', ')}` : ''
  ]
  return clip(
    `# ${v.title}\n\n${head.filter(Boolean).join(' · ')}\n${v.url}${v.hls ? '' : '\n(still being processed by the Assemblée: playable a little later)'}\n\n## Chapters\n\n${chapters || '(no chapters)'}`,
    16_000,
    'Cite the timecoded links of the passages you need.'
  )
}

export function formatLive(streams: LiveStream[]): string {
  const live = streams.filter((s) => s.live)
  const later = streams.filter((s) => !s.live)
  const line = (s: LiveStream) =>
    `- ${s.organ}${s.place ? ` · ${s.place}` : ''} · ${s.live ? 'since' : 'from'} ${when(s.startAt) || s.start} · meeting ${s.meetingId}\n  ${s.title || s.subject}`
  const parts = [live.length ? `# Live now\n\n${live.map(line).join('\n')}` : 'Nothing is broadcast live right now.']
  if (later.length) parts.push(`# Later today\n\n${later.map(line).join('\n')}`)
  parts.push('The user can watch them in the 3615 ASSEMBLEE service (Services page).')
  return parts.join('\n\n')
}
