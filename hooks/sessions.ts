// Pause and shutdown across sessions (0.9.4): each session's sign of life in the state file, the request one session
// makes for all of them, and the words Claude reads about it. No `$` here, so the tests read the rules directly.

import { modeWords } from './i18n'
import type { Lang } from './i18n'
import type { LiveSession, RunsDecision, SessionRequest, ShutdownMode } from '../types'

export type { LiveSession, RunsDecision, SessionRequest } from '../types'


export const SESSIONS_TOOL_NAME = 'pause_sessions'
export const SESSIONS_TOOL = 'mcp__cache-weather-and-pause-resume__pause_sessions'

/** How often a session writes its sign of life and looks at the request. */
export const HEARTBEAT_MS = 15_000
/** A sign of life older than this is a session that has gone (closed, crashed, the computer asleep). */
export const ALIVE_MS = 90_000
/** Signs of life this old leave the state file. */
export const FORGET_MS = 60 * 60_000
/** How long a request waits for a session that has not taken it up, though alive. */
export const UNANSWERED_MS = 15 * 60_000
/** A request this old is history: a session started later does not take it up. */
export const REQUEST_LIFETIME_MS = 24 * 60 * 60_000
/** A transcript written within this span belongs to a session at work. */
export const RECENT_TRANSCRIPT_MS = 5 * 60_000

export const isAlive = (s: LiveSession, now: number): boolean => now - s.seenAt <= ALIVE_MS

/** Something runs there: a turn, a background run, or a dialog that waits for the person. */
export const isBusy = (s: LiveSession): boolean => s.workingSince !== null || s.runs.length > 0 || s.isAwaitingPerson

/** The other sessions alive now, by id. */
export function liveOthers(
  all: Readonly<Record<string, LiveSession>> | undefined,
  self: string | null,
  now: number,
): [string, LiveSession][] {
  return Object.entries(all ?? {}).filter(([id, s]) => id !== self && isLiveSession(s) && isAlive(s, now))
}

/** The signs of life worth keeping: none older than FORGET_MS. */
export function withoutForgotten(
  all: Readonly<Record<string, LiveSession>> | undefined,
  now: number,
): Record<string, LiveSession> {
  return Object.fromEntries(Object.entries(all ?? {}).filter(([, s]) => isLiveSession(s) && now - s.seenAt <= FORGET_MS))
}

export function isLiveSession(value: unknown): value is LiveSession {
  if (value === null || typeof value !== 'object') return false
  const s = value as Partial<LiveSession>
  return typeof s.seenAt === 'number' && Array.isArray(s.runs) && typeof s.phase === 'string'
}

export function isSessionRequest(value: unknown): value is SessionRequest {
  if (value === null || typeof value !== 'object') return false
  const r = value as Partial<SessionRequest>
  return (
    typeof r.id === 'string' &&
    (r.kind === 'pause' || r.kind === 'shutdown') &&
    typeof r.by === 'string' &&
    typeof r.at === 'number' &&
    typeof r.state === 'string'
  )
}

/**
 * Whether another session's request asks this one to pause now: decided after this session started (one opened later
 * was no part of it, as a pause left standing overnight shows), and no older than a day.
 */
export function asksToPause(r: SessionRequest, self: string | null, now: number, startedAt: number): boolean {
  return (
    r.by !== self &&
    (r.state === 'decided' || r.state === 'countdown') &&
    (r.decidedAt ?? r.at) >= startedAt &&
    now - r.at <= REQUEST_LIFETIME_MS
  )
}

/**
 * Whom the shutdown still waits for: the other sessions alive that are neither paused nor idle. One that has not taken
 * the request up is left out once it was decided UNANSWERED_MS ago; one that took it up is waited for, however long
 * its runs take (the person chose to wait for them, or they end now).
 */
export function waitingFor(
  r: SessionRequest,
  all: Readonly<Record<string, LiveSession>> | undefined,
  self: string | null,
  now: number,
): [string, LiveSession][] {
  return liveOthers(all, self, now).filter(([, s]) => {
    if (s.phase === 'paused') return false
    if (s.phase === 'running' && !isBusy(s)) return false
    if (s.requestId === r.id) return true
    return now - (r.decidedAt ?? r.at) <= UNANSWERED_MS
  })
}

/** The last part of a working folder, either slash. */
export function folderOf(cwd: string | null | undefined): string | null {
  if (!cwd) return null
  return cwd.split(/[\\/]/).filter(part => part !== '' && !/^[A-Za-z]:$/.test(part)).at(-1) ?? null
}

/** The short id Claude and the person read a session by. */
export const shortId = (id: string): string => id.slice(0, 8)

/** One session as Claude reads it in the question: its short id, folder, and what runs there. */
export function describeSession(id: string, s: LiveSession, now: number, lang: Lang): string {
  const parts: string[] = []
  if (s.workingSince !== null) {
    const minutes = Math.max(0, Math.floor((now - s.workingSince) / 60_000))
    parts.push(lang === 'de' ? `Claude arbeitet seit ${minutes} min` : `Claude has been working for ${minutes} min`)
  }
  if (s.runs.length > 0) {
    const list = s.runs.slice(0, 5).join(', ')
    parts.push(
      lang === 'de'
        ? `${s.runs.length} ${s.runs.length === 1 ? 'Lauf' : 'Läufe'} im Hintergrund: ${list}`
        : `${s.runs.length} background ${s.runs.length === 1 ? 'run' : 'runs'}: ${list}`,
    )
  }
  if (s.isAwaitingPerson) parts.push(lang === 'de' ? 'wartet auf eine Freigabe oder Antwort' : 'waits for an approval or answer')
  const where = s.folder === null ? '' : ` (${s.folder})`
  return `- ${shortId(id)}${where}: ${parts.join('; ')}`
}

/** What the pause or shutdown request adds when other sessions have running work. */
export function othersNote(
  kind: 'pause' | 'shutdown',
  others: readonly [string, LiveSession][],
  now: number,
  lang: Lang,
  mode: ShutdownMode = 'shutdown',
): string {
  const list = others.map(([id, s]) => describeSession(id, s, now, lang)).join('\n')
  const label = modeWords(mode, lang).label
  if (lang === 'de') {
    const ask =
      kind === 'shutdown'
        ? `Der ${label} pausiert sie mit. Frag den Menschen in derselben Rückfrage wie zu deinen langen Tasks je Sitzung: ihre Läufe jetzt beenden oder zu Ende laufen lassen (der ${label} wartet dann auf sie).`
        : 'Frag den Menschen in derselben Rückfrage wie zu deinen langen Tasks, ob diese Sitzungen mitpausieren sollen, und wenn ja, je Sitzung: ihre Läufe jetzt beenden oder zu Ende laufen lassen.'
    return [
      '🖥 Andere Sitzungen auf diesem Rechner, in denen gerade etwas läuft:',
      list,
      ask,
      'Rufe gleich nach seiner Antwort das Werkzeug pause_sessions damit auf. Danach stellst du keine Rückfragen mehr; die Leiste weist Dialoge bis „weitermachen“ ab.',
    ].join('\n')
  }
  const ask =
    kind === 'shutdown'
      ? `${label} pauses them too. In the same question as about your own long tasks, ask the person for each session: end its runs now, or let them finish (${label.toLowerCase()} then waits for them).`
      : 'In the same question as about your own long tasks, ask the person whether these sessions pause too and, if so, for each session: end its runs now, or let them finish.'
  return [
    '🖥 Other sessions on this computer with work running:',
    list,
    ask,
    'Right after the answer, call the tool pause_sessions with it. After that, ask nothing more; the band turns dialogs away until "continue".',
  ].join('\n')
}

/** What a paused session's Claude reads when Shutdown is pressed there and other sessions have running work. */
export function shutdownOthersPrompt(
  others: readonly [string, LiveSession][],
  now: number,
  lang: Lang,
  mode: ShutdownMode = 'shutdown',
): string {
  const w = modeWords(mode, lang)
  const head =
    lang === 'de'
      ? `⏻ ${w.label}-Knopf: Diese Sitzung ist pausiert, und der Mensch möchte ${w.doIt}. Starte hier nichts.`
      : `⏻ ${w.label} button: this session is paused, and the person wants to ${w.doIt}. Start nothing here.`
  const tail =
    lang === 'de'
      ? 'Melde danach kurz, was entschieden ist, und beende deinen Zug; die Sitzung bleibt pausiert.'
      : 'Then report briefly what was decided and end your turn; the session stays paused.'
  return [head, '', othersNote('shutdown', others, now, lang, mode), tail].join('\n')
}

/** What the Claude of a session that another one paused reads: no questions now, its runs as the person decided. */
export function foreignPauseRequest(
  kind: 'pause' | 'shutdown',
  byFolder: string | null,
  decision: RunsDecision,
  lang: Lang,
  mode: ShutdownMode = 'shutdown',
): string {
  const w = modeWords(mode, lang)
  if (lang === 'de') {
    const where = byFolder === null ? 'einer anderen Sitzung' : `der Sitzung in ${byFolder}`
    const what =
      kind === 'shutdown'
        ? `angefordert, ${w.doIt}; vorher werden alle Sitzungen pausiert, auch diese`
        : 'alle Sitzungen pausiert, auch diese'
    const runs =
      decision === 'end'
        ? '2. Beende deine laufenden Hintergrund-Tasks jetzt (Läufe, Agenten, Monitore, Workflows) und notiere je Task, mit welchem Befehl er nach „weitermachen“ neu startet.'
        : '2. Lass deine laufenden Hintergrund-Tasks zu Ende laufen: beende deinen Zug, du wirst bei ihrem Ende geweckt, und sichere dann auch ihr Ergebnis.'
    return [
      `⏸ Pause aus ${where}: Der Mensch hat dort ${what}. Er ist nicht hier: Stell ihm jetzt keine Frage und zeig keinen Dialog; was du fragen willst, hebst du für „weitermachen“ auf.`,
      '',
      '1. Starte ab jetzt nichts Neues mehr. Schritte, die eine Freigabe des Menschen bräuchten, führst du nicht aus: notiere sie für nach „weitermachen“.',
      runs,
      '3. Sichere den Stand nach den Regeln dieses Projekts (CLAUDE.md, Memory): was erledigt ist, was lief, was abgebrochen wurde und wie es neu startet, was als Nächstes kommt.',
      '4. Rufe dann das Werkzeug pause_state mit state „paused“ auf, melde kurz „Pausiert“ und beende deinen Zug.',
    ].join('\n')
  }
  const where = byFolder === null ? 'another session' : `the session in ${byFolder}`
  const what =
    kind === 'shutdown'
      ? `asked to ${w.doIt}; first every session pauses, this one too`
      : 'paused every session, this one too'
  const runs =
    decision === 'end'
      ? '2. Stop your running background tasks now (runs, agents, monitors, workflows) and note for each the command that restarts it after "continue".'
      : '2. Let your running background tasks finish: end your turn, you will be woken when they finish, and then save their results too.'
  return [
    `⏸ Pause from ${where}: the person there ${what}. They are not here: ask them nothing now and show no dialog; keep what you want to ask for "continue".`,
    '',
    '1. From now on, start nothing new. Steps that would need the person\'s approval you do not run: note them for after "continue".',
    runs,
    "3. Save the state following this project's rules (CLAUDE.md, memory): what is done, what was running, what was stopped and how it restarts, what comes next.",
    '4. Then call the tool pause_state with state "paused", report "Paused" briefly and end your turn.',
  ].join('\n')
}

/** Why the band turns a question dialog away during a pause. */
/**
 * What Claude reads when a call that would ask the person for approval is turned away during a pause (0.10.2): the
 * person is away or about to leave, so the call waits for the resume like a question.
 */
export function approvalRefusal(lang: Lang): string {
  return lang === 'de'
    ? 'Die Sitzung wird pausiert oder ist pausiert: Dieser Schritt bräuchte eine Freigabe des Menschen, der sie jetzt nicht geben kann. Führ ihn nicht aus, notiere ihn im Pausenstand und wiederhole ihn nach „weitermachen“.'
    : 'The session is being paused or is paused: this step would need the person\'s approval, which they cannot give now. Do not run it; note it in the pause state and repeat it after "continue".'
}

export function questionRefusal(lang: Lang): string {
  return lang === 'de'
    ? 'Die Sitzung wird pausiert: Stell jetzt keine Frage. Heb sie für „weitermachen“ auf und notiere sie im Pausenstand.'
    : 'The session is being paused: ask nothing now. Keep the question for "continue" and note it in the pause state.'
}

/** What Claude reads about the tool that takes the person's answer about the other sessions. */
export function sessionsToolDescription(): string {
  return [
    "Records the person's answer about the other Claude sessions on this computer, when the band's pause or shutdown request listed them and told you to ask: whether they pause too (pauseOthers; a shutdown always takes them) and, for each listed session, whether its running work ends now (\"end\") or is waited for (\"wait\").",
    '',
    'Call it once, right after the person answered. From then on the band turns question dialogs away until the pause is over. Do not call it otherwise.',
  ].join('\n')
}

/** The answer as the tool takes it, made safe: unknown sessions and actions are left out. */
export function readDecisions(
  input: unknown,
  listed: readonly string[],
): { pauseOthers: boolean; decisions: Record<string, RunsDecision> } {
  const value = (input ?? {}) as { pauseOthers?: unknown; sessions?: unknown }
  const decisions: Record<string, RunsDecision> = {}
  if (Array.isArray(value.sessions)) {
    for (const entry of value.sessions as unknown[]) {
      const { session, action } = (entry ?? {}) as { session?: unknown; action?: unknown }
      if (typeof session !== 'string' || (action !== 'end' && action !== 'wait')) continue
      const id = listed.find(full => full === session || shortId(full) === session.trim())
      if (id !== undefined) decisions[id] = action
    }
  }
  // A pause stays with its own session unless the answer says otherwise (the person's rule, 2026-11-09).
  return { pauseOthers: value.pauseOthers === true, decisions }
}
