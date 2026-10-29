import { formatNumber } from '@marianne/sdk'
import { clip, plural, table } from '@marianne/sdk/main'
import { videoPage } from './links'
import { clock, parisDay, parisTime } from './time'
import type { AgendaMeeting, BallotDetail, BallotLine, MemberCard, MemberProfile, MemberVote, LiveStream, Position, VideoDetail, VideoItem } from './types'

/** The tools' results: compact Markdown in English, for the model, with the links and ids it needs to cite. */

const POSITIONS: Record<Position, string> = { for: 'for', against: 'against', abstention: 'abstention', nonVoting: 'non-voting' }
const CHAMBER: Record<string, string> = { an: 'Assemblée', se: 'Sénat' }

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text)

const vote = (v: MemberVote | undefined) => (v?.position ? `${POSITIONS[v.position]}${v.proxy ? ' (by proxy)' : ''}` : 'did not take part')

const department = (d: Pick<MemberCard, 'department' | 'departmentNumber'>) => `${d.department} (${d.departmentNumber})`

/** "2026-10-28 14:00", Paris time. */
const when = (iso: string) => (iso ? `${parisDay(new Date(iso))} ${parisTime(iso)}` : '')

export function formatMembers(cards: MemberCard[], limit: number, scope = ''): string {
  const shown = cards.slice(0, limit)
  const head = `${plural(cards.length, 'member', 'members')} of Parliament${scope ? ` · ${scope}` : ''}${cards.length > shown.length ? ` (the first ${shown.length})` : ''}:`
  return `${head}\n\n${table(
    ['member', 'chamber', 'group', 'département', 'constituency', 'id'],
    shown.map((d) => [d.name, CHAMBER[d.chamber], d.groupShort || 'non-attached', department(d), d.constituency || '-', d.id])
  )}`
}

export function formatMember(p: MemberProfile): string {
  const a = p.analysis
  const facts = [
    `${CHAMBER[p.chamber]} · ${p.group ? `${p.group}${p.groupShort ? ` (${p.groupShort})` : ''}` : 'non-attached'} · ${department(p)}${p.constituency ? `, constituency ${p.constituency}` : ''}${p.mandateStart ? ` · since ${p.mandateStart}` : ''}`,
    [p.profession && `profession: ${p.profession}`, p.birthDate && `born ${p.birthDate}`].filter(Boolean).join(' · '),
    `page: ${p.url}${p.hatvp ? ` · declarations of interests (HATVP): ${p.hatvp}` : ''}`,
    p.emails.length ? `email: ${p.emails.join(', ')}` : '',
    p.office ? `constituency office: ${p.office}` : '',
    p.websites.length ? `websites: ${p.websites.join(', ')}` : '',
    `last 30 days: voted in ${a.voted} of ${a.ballots} public ballots${a.proxies ? ` (${a.proxies} by proxy)` : ''}, with their group's majority in ${a.voted ? Math.round((a.loyal / a.voted) * 100) : 0} %${p.chamber === 'se' ? ' (at the Sénat, groups often vote for all their members)' : ''}`
  ]
  const lines = [`# ${p.name} (${p.id})`, '', ...facts.filter(Boolean)]
  if (p.roles.length) lines.push('', '## Roles', '', ...p.roles.map((r) => `- ${r.role} · ${r.organ}`))
  const recent = p.recent
    .filter((r) => r.vote.position)
    .slice(-12)
    .reverse()
  if (recent.length)
    lines.push(
      '',
      '## Latest votes',
      '',
      table(
        ['date', 'ballot', 'subject', 'vote', 'result'],
        recent.map((r) => [r.ballot.date, r.ballot.number, cut(r.ballot.title, 110), vote(r.vote), r.ballot.result])
      )
    )
  return lines.join('\n')
}

const author = (b: BallotLine) =>
  b.author ? `${b.author.name}${b.author.groupShort && b.author.id !== b.author.groupId ? ` (${b.author.groupShort})` : ''}` : ''

export function formatBallots(rows: BallotLine[], member?: string): string {
  const head = ['chamber', 'date', 'n°', 'subject', 'tabled by', 'result', ...(member ? [member] : []), 'link']
  return `${plural(rows.length, 'public ballot')}:\n\n${table(
    head,
    rows.map((b) => [CHAMBER[b.chamber], b.date, b.number, cut(b.title, 140), author(b), b.result, ...(member ? [vote(b.vote)] : []), b.url])
  )}`
}

export function formatBallot(b: BallotDetail): string {
  const lines = [
    `# ${CHAMBER[b.chamber]}, public ballot n° ${b.number} (${b.date})`,
    '',
    b.title,
    b.billTitle ? `legislative file: ${b.billTitle}` : '',
    b.author ? `tabled by: ${author(b)}` : '',
    `result: ${b.result} · ${formatNumber(b.voters)} voters: ${formatNumber(b.for)} for, ${formatNumber(b.against)} against, ${formatNumber(b.abstentions)} abstentions${b.chamber === 'an' ? ` · ${b.proxies} by proxy` : ''}`,
    `link: ${b.url}`
  ].filter((l) => l !== '')
  if (b.groups.length)
    lines.push(
      '',
      '## Groups',
      '',
      table(
        ['group', 'position', 'for', 'against', 'abstentions', 'members'],
        b.groups.map((g) => [g.shortName || g.name, g.position ? POSITIONS[g.position] : '', g.for, g.against, g.abstentions, g.members])
      )
    )
  if (b.votes.length) lines.push('', '## Asked', '', ...b.votes.map((v) => `- ${v.member.name} (${v.member.groupShort}): ${vote(v.vote)}`))
  if (b.dissidents.length)
    lines.push(
      '',
      `Voted otherwise than their group: ${b.dissidents
        .slice(0, 12)
        .map((d) => `${d.member.name} (${d.member.groupShort}, ${POSITIONS[d.position]})`)
        .join('; ')}`
    )
  return lines.join('\n')
}

export function formatAgenda(from: string, to: string, meetings: AgendaMeeting[]): string {
  if (!meetings.length) return `Nothing on the agenda of either chamber ${from === to ? `on ${from}` : `from ${from} to ${to}`}.`
  return clip(
    meetings
      .map((m) => {
        const state = [m.live ? 'LIVE NOW' : '', m.state === 'cancelled' ? 'cancelled' : m.state === 'tentative' ? 'tentative' : '', m.video ? 'filmed' : '']
          .filter(Boolean)
          .join(', ')
        return `- ${when(m.start)} · ${CHAMBER[m.chamber]} · ${m.kind === 'sitting' ? 'public sitting' : m.organ || 'meeting'}${m.place ? ` · ${m.place}` : ''}${state ? ` (${state})` : ''} · id ${m.id}\n  ${m.items.map((i) => cut(i, 220)).join('\n  ')}`
      })
      .join('\n'),
    9000,
    'Ask for one day, or one chamber, for the rest.'
  )
}

export function formatVideos(videos: VideoItem[], limit: number): string {
  const shown = videos.slice(0, limit)
  return `${plural(videos.length, 'video')}${videos.length > shown.length ? ` (the first ${shown.length})` : ''}:\n\n${table(
    ['chamber', 'date', 'type', 'title', 'link'],
    shown.map((v) => [CHAMBER[v.chamber], when(v.date), v.type, cut(v.title, 120), v.url])
  )}`
}

export function formatVideo(v: VideoDetail): string {
  const lines = [
    `# ${v.title}`,
    '',
    `${CHAMBER[v.chamber]} · ${when(v.date)} · ${v.type}${v.organ ? ` · ${v.organ}` : ''}${v.durationMs ? ` · ${clock(v.durationMs)}` : ''}`,
    `link: ${v.url}`,
    v.meetingIds.length ? `meetings: ${v.meetingIds.join(', ')}` : ''
  ].filter(Boolean)
  const timed = v.chapters.filter((c) => c.timecode !== null)
  if (timed.length)
    lines.push(
      '',
      '## Chapters',
      '',
      clip(
        timed
          .map(
            (c) =>
              `- ${clock(c.timecode!)} ${'  '.repeat(c.depth)}${cut(c.title, 160)}${c.speaker ? ` (${c.speaker}${c.member ? `, ${c.member}` : ''})` : ''} · ${videoPage(v.chamber, v.id, c.timecode!)}`
          )
          .join('\n'),
        8000
      )
    )
  return lines.join('\n')
}

export function formatLive(streams: LiveStream[]): string {
  if (!streams.length) return 'Neither chamber broadcasts anything live right now, and nothing more is announced for today.'
  return streams
    .map(
      (s) =>
        `- ${s.live ? 'LIVE NOW' : `announced ${s.start}`} · ${CHAMBER[s.chamber]} · ${s.organ}${s.title || s.subject ? `: ${cut(s.title || s.subject, 200)}` : ''} · ${s.url}`
    )
    .join('\n')
}
