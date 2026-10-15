import { atom, read, update } from 'claude-code'
import type { ClassicResultOf, EngineInterface, Register } from 'claude-code'

import type { ContextFill, KeepAliveNote, PausePhase, Threshold, Ttl } from '../types'
import { langOf, runtimeLocale, strings } from './i18n'
import type { Lang } from './i18n'
import {
  FALLBACK_THRESHOLD_PERCENT,
  SVG_BAR_HEIGHT,
  cacheTone,
  compactionLines,
  groupDigits,
  hitRate,
  isWarmRead,
  keepAliveSpanText,
  keepAliveStep,
  lastResponseFromTranscript,
  lifetimeFromResume,
  pauseSigns,
  remainingMinutes,
  remainingShare,
  svgBar,
  terminalBar,
  terminalWeather,
  thresholdPercent,
  ttlFromTranscript,
  weather,
} from './logic'
import {
  askAboveMinutes,
  inFlight,
  isOwnOrigin,
  isPauseCommand,
  isPersonOrigin,
  isResume,
  minutesBetween,
  pauseRequest,
  pausedMachineNote,
  pausedPersonNote,
  pausingNote,
  resumeContext,
  resumeText,
  sinceText,
} from './pause'

// Written at every load: which code a session runs, read off the state file on disk.
const CODE_VERSION = '0.8.0'

const lastResponseAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'lastResponseAt' } as const, null)
const ttl = atom({ plugin: 'cache-weather-and-pause-resume', key: 'ttl' } as const, null)
const lastHitRate = atom({ plugin: 'cache-weather-and-pause-resume', key: 'hitRate' } as const, null)
const context = atom({ plugin: 'cache-weather-and-pause-resume', key: 'context' } as const, null)
const threshold = atom({ plugin: 'cache-weather-and-pause-resume', key: 'threshold' } as const, null)
const now = atom({ plugin: 'cache-weather-and-pause-resume', key: 'now' } as const, 0)
const transcriptPath = atom({ plugin: 'cache-weather-and-pause-resume', key: 'transcriptPath' } as const, null)
const isCompacting = atom({ plugin: 'cache-weather-and-pause-resume', key: 'isCompacting' } as const, false)
const pausePhase = atom({ plugin: 'cache-weather-and-pause-resume', key: 'pausePhase' } as const, 'running')
const pauseRequestedAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'pauseRequestedAt' } as const, null)
const pausedAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'pausedAt' } as const, null)
const pauseDelivered = atom({ plugin: 'cache-weather-and-pause-resume', key: 'pauseDelivered' } as const, true)
const pauseTasksLeft = atom({ plugin: 'cache-weather-and-pause-resume', key: 'pauseTasksLeft' } as const, null)
const turnRunning = atom({ plugin: 'cache-weather-and-pause-resume', key: 'turnRunning' } as const, false)
const sessionId = atom({ plugin: 'cache-weather-and-pause-resume', key: 'sessionId' } as const, null)
const language = atom({ plugin: 'cache-weather-and-pause-resume', key: 'language' } as const, null)
const keepAlive = atom({ plugin: 'cache-weather-and-pause-resume', key: 'keepAlive' } as const, false)
const cacheUsedAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'cacheUsedAt' } as const, null)
const activeAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'activeAt' } as const, null)
const keepAliveNote = atom({ plugin: 'cache-weather-and-pause-resume', key: 'keepAliveNote' } as const, null)
const keepAliveRefreshes = atom({ plugin: 'cache-weather-and-pause-resume', key: 'keepAliveRefreshes' } as const, 0)

// The language before session.start has read the locale: the option, else the runtime's locale. Set by `register`.
let fallbackLang: Lang = 'en'

// What outlives a session (paused and kept-alive sessions by id, the cache lifetime last seen) lives in one file,
// ~/.claude/cache-weather-and-pause-resume/state.json, not in `$.store`: the store is keyed by how the mod was loaded
// (handed in by the desktop app „inline“, or by the CLI's own loader), so a pause kept there was gone after a restart
// that loaded the mod the other way (2026-10-13). Each call spells its path out under the home folder, so the source
// shows which files the mod touches.
const SESSIONS_KEEP = 20
// The pruning waits so it never holds up the session's start.
const PRUNE_AFTER_MS = 10_000

type Persisted = {
  ttlMinutes?: number
  /** When a session last read the lifetime itself (a transcript, a model switch, a resumed session's start). */
  ttlConfirmedAt?: number
  pausedSessions?: Record<string, number>
  /** The sessions keep-alive is switched on in, by id, with the time it was. */
  keepAliveSessions?: Record<string, number>
  codeVersion?: string
}

// $.fs.read refuses files over 4 MiB: a longer transcript is not read, and the values remembered stand. (The mod
// starts no program to read its end.) Since Claude Code 2.1.300 a transcript also records each request's system prompt
// and tools, so a long session passes the limit early.
const FS_READ_LIMIT = 3.5 * 1024 * 1024

// The lifetime follows the account's setting, not the session: one a session read within the last day counts as
// confirmed in another session that cannot read its own (a transcript over the limit), and shows without „?“.
const CONFIRMED_FOR_MS = 24 * 60 * 60 * 1000

async function tick($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
}

// The mod's language: the `language` option, else the locale variables, else the runtime's locale (on Windows the
// system language; LANG is unset there), else English. Claude Code's settings are not read: they can hold keys and
// helper commands, and the mod needs none of that.
async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  const chosen = langOf(option)
  if (chosen !== null) return chosen
  try {
    const fromEnv =
      langOf(await $.env.get('LC_ALL')) ?? langOf(await $.env.get('LC_MESSAGES')) ?? langOf(await $.env.get('LANG'))
    if (fromEnv !== null) return fromEnv
  } catch {
    // No environment: the runtime's locale decides.
  }
  return langOf(runtimeLocale()) ?? 'en'
}

async function currentLang($: EngineInterface): Promise<Lang> {
  return (await read($, language)) ?? fallbackLang
}

async function refreshContext($: EngineInterface): Promise<void> {
  const { context: c } = await $.session.usage()
  const fill: ContextFill = { percent: c.percent ?? null, tokens: c.tokens ?? null, window: c.window }
  await update($, context, () => fill)
}

// The session's own auto-compact threshold (a local estimate, no API request); 83 % when it gives none.
async function refreshThreshold($: EngineInterface): Promise<void> {
  let next: Threshold = { percent: FALLBACK_THRESHOLD_PERCENT, isFallback: true }
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const b = usage.context.breakdown
    const percent = b?.isAutoCompactEnabled ? thresholdPercent(b.autoCompactThreshold, usage.context.window) : null
    if (percent !== null) next = { percent, isFallback: false }
  } catch {
    // No session bound yet: keep the fallback and try again after the next turn.
  }
  await update($, threshold, () => next)
}

// The session's transcript, when small enough for one read.
async function readTranscript($: EngineInterface, path: string): Promise<string | null> {
  try {
    const stat = await $.fs.stat(path)
    return stat.size <= FS_READ_LIMIT ? await $.fs.read(path) : null
  } catch {
    return null
  }
}

// A lifetime this session read itself: shown, and kept on disk with the time it was confirmed.
async function settleTtl($: EngineInterface, found: Ttl): Promise<void> {
  await update($, ttl, () => found)
  const at = await $.clock.now()
  await writePersisted($, p => ({ ...p, ttlMinutes: found.minutes, ttlConfirmedAt: at }))
}

// The lifetime last seen, for a session that knows none yet (a new one, or one Claude Code started over after
// /compact or /clear): confirmed when read within the last day, else shown with „?“.
async function applyRememberedTtl($: EngineInterface): Promise<void> {
  if ((await read($, ttl)) !== null) return
  const persisted = await readPersisted($)
  const minutes = persisted.ttlMinutes
  if (minutes !== 5 && minutes !== 60) return
  const at = await $.clock.now()
  const confirmedAt = persisted.ttlConfirmedAt
  const isConfirmed = typeof confirmedAt === 'number' && at - confirmedAt <= CONFIRMED_FOR_MS
  const guess: Ttl = { minutes, source: isConfirmed ? 'confirmed' : 'remembered' }
  await update($, ttl, () => guess)
}

// A lifetime taken from an earlier session, which a reading in this one replaces.
const isCarriedOver = (life: Ttl | null): boolean => life === null || life.source === 'remembered' || life.source === 'confirmed'

// Reads the lifetime the session's cache writes actually use, and the last response's time when none is known yet.
async function detectFromTranscript($: EngineInterface): Promise<void> {
  const known = await read($, ttl)
  const hasResponse = (await read($, lastResponseAt)) !== null
  if (!isCarriedOver(known) && hasResponse) return

  const path = await read($, transcriptPath)
  if (!path) return
  const text = await readTranscript($, path)
  if (!text) return

  const minutes = ttlFromTranscript(text)
  if (minutes !== null && isCarriedOver(known)) await settleTtl($, { minutes, source: 'transcript' })
  if (!hasResponse) {
    const at = lastResponseFromTranscript(text)
    if (at !== null) await update($, lastResponseAt, prev => prev ?? at)
  }
}

async function queueCompact($: EngineInterface): Promise<void> {
  const t = strings(await currentLang($))
  $.ui.toast(t.compactQueued)
  try {
    await $.command.run({ command: 'compact' })
  } catch (error) {
    $.ui.toast(t.compactQueueFailed(String(error)))
  }
}

// ── What outlives a session ───────────────────────────────────────────────────────────────────────────────────────

// The user's home folder without a trailing separator. The paths under it go with forward slashes, which Windows
// takes as well.
async function homeDir($: EngineInterface): Promise<string | null> {
  try {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    return home ? home.replace(/[\\/]+$/, '') : null
  } catch {
    return null
  }
}

// A map of session ids to times with one session set (a time) or taken out (null); the latest SESSIONS_KEEP stay.
function withSession(all: Record<string, number> | undefined, id: string, at: number | null): Record<string, number> {
  const next = { ...(all ?? {}) }
  if (at === null) delete next[id]
  else next[id] = at
  const kept = Object.entries(next)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort((a, b) => b[1] - a[1])
    .slice(0, SESSIONS_KEEP)
  return Object.fromEntries(kept)
}

// Drops the remembered pauses and keep-alives of sessions that are gone: no transcript `<id>.jsonl` in any project
// folder (the session was deleted). Unsure is never gone: an unreadable or empty projects folder drops nothing, and
// this session is kept.
async function pruneSessions($: EngineInterface): Promise<void> {
  const persisted = await readPersisted($)
  const keep = await read($, sessionId)
  const ids = [...new Set([...Object.keys(persisted.pausedSessions ?? {}), ...Object.keys(persisted.keepAliveSessions ?? {})])].filter(
    id => id !== keep,
  )
  if (ids.length === 0) return
  const home = await homeDir($)
  if (home === null) return
  const transcripts = new Set<string>()
  try {
    const dirs = (await $.fs.list(`${home}/.claude/projects`)).filter(entry => entry.kind === 'dir')
    if (dirs.length === 0) return
    for (const dir of dirs) {
      for (const entry of await $.fs.list(`${home}/.claude/projects/${dir.name}`)) {
        if (entry.kind === 'file' && entry.name.endsWith('.jsonl')) transcripts.add(entry.name.slice(0, -'.jsonl'.length))
      }
    }
  } catch {
    return
  }
  if (transcripts.size === 0) return
  const gone = ids.filter(id => !transcripts.has(id))
  if (gone.length === 0) return
  await writePersisted($, p => {
    const paused = { ...(p.pausedSessions ?? {}) }
    const kept = { ...(p.keepAliveSessions ?? {}) }
    for (const id of gone) {
      delete paused[id]
      delete kept[id]
    }
    return { ...p, pausedSessions: paused, keepAliveSessions: kept }
  })
}

async function readPersisted($: EngineInterface): Promise<Persisted> {
  const home = await homeDir($)
  if (home === null) return {}
  try {
    if (!(await $.fs.exists(`${home}/.claude/cache-weather-and-pause-resume/state.json`))) return {}
    const value: unknown = JSON.parse(await $.fs.read(`${home}/.claude/cache-weather-and-pause-resume/state.json`))
    return value !== null && typeof value === 'object' ? (value as Persisted) : {}
  } catch {
    return {}
  }
}

// Read, change, write: another session may have written in between, so each write starts from the file.
async function writePersisted($: EngineInterface, change: (p: Persisted) => Persisted): Promise<void> {
  const home = await homeDir($)
  if (home === null) return
  try {
    const text = `${JSON.stringify(change(await readPersisted($)), null, 2)}\n`
    await $.fs.write(`${home}/.claude/cache-weather-and-pause-resume/state.json`, text)
  } catch {
    // Not writable: the value lives in this session's state alone.
  }
}

// The session's id: from the classic hooks, which carry it, else asked for (it rejects until the session binds).
async function currentSessionId($: EngineInterface): Promise<string | null> {
  const known = await read($, sessionId)
  if (known !== null) return known
  try {
    const id = await $.session.id()
    await update($, sessionId, () => id)
    return id
  } catch {
    return null
  }
}

// ── Keep-alive ────────────────────────────────────────────────────────────────────────────────────────────────────

// Shortly before the cache lapses, keep-alive asks one question over the conversation as its last request sent it
// ($.model.fork): the API serves that from the cache, which keeps the cache warm for another lifetime. The question
// and its answer stay out of the conversation, and the fork may call no tool. A refresh reads the whole context from
// the cache, so a session nobody works in is kept warm for a while only (keepAliveSpanMs).
const KEEP_ALIVE_PROMPT =
  'Automated keep-alive request of the cache-weather-and-pause-resume mod: it only keeps the prompt cache warm, and ' +
  'your reply is discarded. Reply with OK and nothing else.'
// How often keep-alive looks whether a refresh is due; the earliest refresh is a minute before the cache lapses.
const KEEP_ALIVE_CHECK_MS = 15_000
// After a refresh that failed (an API error), the next try waits this long.
const KEEP_ALIVE_RETRY_MS = 30_000

// The module's own: a reload starts them over, and its timers go with the old module.
let keepAliveStarted = false
let isRefreshing = false
let retryAt = 0

function startKeepAlive($: EngineInterface): void {
  if (keepAliveStarted) return
  keepAliveStarted = true
  $.clock.every(KEEP_ALIVE_CHECK_MS, () => {
    void keepAliveTick($).catch(() => undefined)
  })
}

// A request of the conversation's own, or the person switching keep-alive on: the cache was used (or is about to be),
// and the idle span starts over.
async function markActive($: EngineInterface, at: number, isRequest: boolean): Promise<void> {
  if (isRequest) await update($, cacheUsedAt, () => at)
  await update($, activeAt, () => at)
  await update($, keepAliveNote, () => null)
  await update($, keepAliveRefreshes, () => 0)
}

async function keepAliveTick($: EngineInterface): Promise<void> {
  if (isRefreshing || !(await read($, keepAlive)) || (await read($, keepAliveNote)) !== null) return
  const at = await $.clock.now()
  if (at < retryAt) return
  const life = await read($, ttl)
  const last = await read($, lastResponseAt)
  // A resumed session knows its last response alone: the idle span starts there, and stays put as refreshes come.
  if ((await read($, activeAt)) === null && last !== null) await update($, activeAt, () => last)
  const step = keepAliveStep({
    cacheUsedAt: (await read($, cacheUsedAt)) ?? last,
    activeAt: (await read($, activeAt)) ?? last,
    ttlMinutes: life?.minutes ?? null,
    isWorking: (await read($, turnRunning)) || (await read($, pausePhase)) === 'pausing',
    now: at,
  })
  const lang = await currentLang($)
  const t = strings(lang)
  if (step === 'ended' && life !== null) {
    await update($, keepAliveNote, () => 'ended')
    $.ui.log(t.keepAliveEndedLog(keepAliveSpanText(life.minutes), life.minutes === 60 ? '1-h' : '5-m'))
    return
  }
  if (step !== 'refresh') return

  isRefreshing = true
  try {
    const result = await $.model.fork({ prompt: KEEP_ALIVE_PROMPT })
    if (!result.isAnswered && result.reason === 'nothing-to-fork') {
      await update($, keepAliveNote, () => 'missed')
      return
    }
    const usage = result.usage
    if (isWarmRead(usage)) {
      await update($, cacheUsedAt, () => at)
      await update($, lastResponseAt, () => at)
      await update($, now, () => at)
      await update($, keepAliveRefreshes, n => n + 1)
      $.ui.log(t.keepAliveRefreshedLog(groupDigits(usage.cache_read_input_tokens, lang), groupDigits(usage.output_tokens, lang)))
    } else if (usage.input_tokens + usage.cache_creation_input_tokens > 0) {
      // Answered, but not from the cache: it had lapsed. The next request of the conversation builds it again.
      await update($, keepAliveNote, () => 'missed')
      $.ui.log(t.keepAliveMissedLog)
    } else {
      retryAt = at + KEEP_ALIVE_RETRY_MS
    }
  } finally {
    isRefreshing = false
  }
}

// The person's switch, for this session alone: kept under its id, so a restart or a resume keeps it, and a new
// session (`/clear` too) starts without.
async function setKeepAlive($: EngineInterface, value: boolean): Promise<void> {
  await update($, keepAlive, () => value)
  const at = await $.clock.now()
  if (value) await markActive($, at, false)
  const id = await currentSessionId($)
  if (id === null) return
  await writePersisted($, p => ({ ...p, keepAliveSessions: withSession(p.keepAliveSessions, id, value ? at : null) }))
}

async function restoreKeepAlive($: EngineInterface, id: string): Promise<void> {
  const isOn = (await readPersisted($)).keepAliveSessions?.[id] !== undefined
  await update($, keepAlive, () => isOn)
}

// ── The pause button ──────────────────────────────────────────────────────────────────────────────────────────────

async function rememberPause($: EngineInterface, at: number | null): Promise<void> {
  const id = await currentSessionId($)
  if (id === null) return
  if (at === null && (await readPersisted($)).pausedSessions?.[id] === undefined) return
  await writePersisted($, p => ({ ...p, pausedSessions: withSession(p.pausedSessions, id, at) }))
}

// A session reopened while paused (the app restarted, the session resumed) shows „Weitermachen“ again.
async function restorePause($: EngineInterface, id: string): Promise<void> {
  if ((await read($, pausePhase)) !== 'running') return
  const since = (await readPersisted($)).pausedSessions?.[id]
  if (typeof since !== 'number') return
  const at = await $.clock.now()
  await update($, pausedAt, () => since)
  await update($, now, () => at)
  await setPausePhase($, 'paused')
}

async function setPausePhase($: EngineInterface, next: PausePhase): Promise<void> {
  await update($, pausePhase, () => next)
}

async function enterPausing($: EngineInterface, isDelivered: boolean): Promise<void> {
  const at = await $.clock.now()
  await update($, pauseRequestedAt, () => at)
  await update($, pauseTasksLeft, () => null)
  await update($, pauseDelivered, () => isDelivered)
  await update($, now, () => at)
  await setPausePhase($, 'pausing')
}

async function enterPaused($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, pausedAt, () => at)
  await update($, pauseTasksLeft, () => null)
  await update($, now, () => at)
  await setPausePhase($, 'paused')
  await rememberPause($, at)
  $.ui.toast(strings(await currentLang($)).pausedToast)
}

async function enterRunning($: EngineInterface): Promise<void> {
  await setPausePhase($, 'running')
  await update($, pauseRequestedAt, () => null)
  await update($, pausedAt, () => null)
  await update($, pauseTasksLeft, () => null)
  await update($, pauseDelivered, () => true)
  await rememberPause($, null)
}

// Hands the model a text now: folded into the running turn as a row it reads at its next request, or as a prompt
// that starts a turn once the session is idle. Answers whether the text waits for the turn's next request.
async function handToModel($: EngineInterface, text: string): Promise<'appended' | 'submitted'> {
  if (await read($, turnRunning)) {
    try {
      const row = await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
      if (row.deny === undefined) return 'appended'
    } catch {
      // The run takes no plugin rows: queue the text as a prompt instead.
    }
  }
  const t = strings(await currentLang($))
  $.prompt.submit({ text, asUser: true }).catch(error => {
    $.ui.toast(t.sendFailed(String(error)))
  })
  return 'submitted'
}

async function requestPause($: EngineInterface, askAbove: number): Promise<void> {
  if ((await read($, pausePhase)) !== 'running') return
  const lang = await currentLang($)
  await enterPausing($, true)
  // An appended row waits for the turn's next request; should the turn end first, the Stop hook hands it on.
  // (Marked after the append: a request racing it at worst hands the model the request twice.)
  if ((await handToModel($, pauseRequest(askAbove, lang))) === 'appended') await update($, pauseDelivered, () => false)
  $.ui.toast(strings(lang).pauseRequestedToast)
}

async function requestResume($: EngineInterface): Promise<void> {
  const current = await read($, pausePhase)
  if (current === 'running') return
  const since = current === 'paused' ? await read($, pausedAt) : await read($, pauseRequestedAt)
  const minutes = minutesBetween(since, await $.clock.now())
  const lang = await currentLang($)
  await enterRunning($)
  // The plugin's own prompt passes its own prompt.submit hook by, so the note goes ahead of it as a row of its own
  // (idle: the row waits in the conversation for the turn „weitermachen“ starts).
  try {
    const note = resumeContext(minutes, lang)
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: note }] } })
  } catch {
    // Without the note „weitermachen“ still reads plainly after the pause report.
  }
  $.prompt.submit({ text: resumeText(lang), asUser: true }).catch(error => {
    $.ui.toast(strings(lang).resumeSendFailed(String(error)))
  })
}

// Claude stopped: had it not read the request yet, it does not stop but goes on with the request as the Stop hook's
// reason (a settings hook's „decision: block“); with nothing in flight any more, the session is paused.
async function pauseOnStop(
  $: EngineInterface,
  tasks: readonly { status: string }[] | undefined,
  result: ClassicResultOf['classic.Stop'],
  askAbove: number,
): Promise<ClassicResultOf['classic.Stop']> {
  await update($, turnRunning, () => false)
  if ((await read($, pausePhase)) !== 'pausing') return result
  if (!(await read($, pauseDelivered))) {
    await update($, pauseDelivered, () => true)
    if (result.block !== undefined) return result
    return { ...result, block: pauseRequest(askAbove, await currentLang($)) }
  }
  const left = inFlight(tasks)
  if (left > 0) {
    await update($, pauseTasksLeft, () => left)
    return result
  }
  await enterPaused($)
  return result
}

export const register: Register = (on, options) => {
  const askAbove = askAboveMinutes(options)
  keepAliveStarted = false
  isRefreshing = false
  retryAt = 0
  fallbackLang = langOf(options.language) ?? langOf(runtimeLocale()) ?? 'en'

  on('session.start', async ($, e, next) => {
    const started = await next(e)

    const lang = await detectLang($, options.language)
    await update($, language, () => lang)
    await applyRememberedTtl($)
    await update($, isCompacting, () => false)
    await update($, turnRunning, () => false)
    await $.store.set('codeVersion', CODE_VERSION)
    await writePersisted($, p => ({ ...p, codeVersion: CODE_VERSION }))
    const id = await currentSessionId($)
    if (id !== null) {
      await restorePause($, id)
      await restoreKeepAlive($, id)
    }

    await refreshContext($)
    await refreshThreshold($)
    await tick($)
    await detectFromTranscript($)

    // Redraws the countdown once a minute.
    $.clock.every(60_000, () => {
      void tick($)
    })
    startKeepAlive($)
    return started
  })

  // The four hooks below only observe: should their own work fail, `.catch` hands on what `next` settled to (or runs
  // it, where it was not called yet), so nothing is refused and nothing runs twice.
  on('classic.SessionStart', async ($, e, next) => {
    await update($, transcriptPath, () => e.transcript_path)
    // A resumed session carries its id here even where `$.session.id()` was not bound yet at session.start; after
    // /clear the id is a new one, whose pause (none) is restored.
    await update($, sessionId, () => e.session_id)
    await restorePause($, e.session_id)
    await restoreKeepAlive($, e.session_id)
    // A resumed session says how long ago its last response was: the countdown needs no transcript for it.
    const seconds = e.seconds_since_last_response
    if (typeof seconds === 'number' && (await read($, lastResponseAt)) === null) {
      const at = await $.clock.now()
      await update($, lastResponseAt, () => at - seconds * 1000)
      await update($, now, () => at)
    }
    // And whether the cache likely expired since, which tells the lifetime; else the one last seen. This start comes on
    // every new start of the session (resume, /compact, /clear), where session.start does not.
    const told = lifetimeFromResume(seconds, e.prompt_cache_likely_expired)
    if (told !== null && isCarriedOver(await read($, ttl))) await settleTtl($, { minutes: told, source: 'session-start' })
    await applyRememberedTtl($)
    startKeepAlive($)
    // Once per session start, a little later: what is remembered of deleted sessions goes.
    $.clock.after(PRUNE_AFTER_MS, () => {
      void pruneSessions($).catch(() => undefined)
    })
    return next(e)
  }).catch(($, e, next) => next(e))

  // Each response of the main conversation: the cache was read or written now, and its hit rate. A request that
  // starts after the pause row was appended carries it.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      try {
        if ((await read($, pausePhase)) === 'pausing' && !(await read($, pauseDelivered))) {
          await update($, pauseDelivered, () => true)
        }
        // A request of the conversation's own reads the cache now, and the idle span starts over. Should a refresh of
        // an idle session come by here, no turn runs: it is not counted.
        if (!isRefreshing || (await read($, turnRunning))) await markActive($, await $.clock.now(), true)
      } catch {
        // Never hold up a request over the band's bookkeeping.
      }
    }
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage) {
      const at = await $.clock.now()
      const rate = hitRate(result.usage)
      await update($, lastResponseAt, () => at)
      await update($, lastHitRate, () => rate)
      await update($, now, () => at)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('context')) {
      const fill: ContextFill = {
        percent: e.context.percent ?? null,
        tokens: e.context.tokens ?? null,
        window: e.context.window,
      }
      await update($, context, () => fill)
    }
    return result
  })

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    if (e.agent_id !== undefined) return result
    await update($, sessionId, () => e.session_id)
    try {
      await update($, transcriptPath, () => e.transcript_path)
      await detectFromTranscript($)
      if ((await read($, threshold))?.isFallback !== false) await refreshThreshold($)
    } catch {
      // The readings wait for the next stop; the pause below must not.
    }
    return pauseOnStop($, e.background_tasks, result, askAbove)
  }).catch(($, e, next) => next(e))

  // Since Claude Code 2.1.299 turn.start also comes for subagents' turns (with `agentId`): only the main loop's counts.
  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) await update($, turnRunning, () => true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await update($, turnRunning, () => false)
    return result
  }).catch(($, e, next) => next(e))

  // After /clear the conversation the pause belonged to is gone.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear') await enterRunning($)
    return result
  }).catch(($, e, next) => next(e))

  // Typed „pausieren“ pauses, „weitermachen“ resumes; while pausing or paused every other prompt carries a note.
  on('prompt.submit', async ($, e, next) => {
    const current = await read($, pausePhase)
    const isPerson = isPersonOrigin(e.origin)
    const lang = await currentLang($)
    const withNote = (note: string) => next({ ...e, context: [...(e.context ?? []), note] })

    if (isPerson && current !== 'running' && isResume(e.text)) {
      const since = current === 'paused' ? await read($, pausedAt) : await read($, pauseRequestedAt)
      const minutes = minutesBetween(since, await $.clock.now())
      await enterRunning($)
      return withNote(resumeContext(minutes, lang))
    }
    if (isOwnOrigin(e.origin)) return next(e)
    if (isPerson && current === 'running' && isPauseCommand(e.text)) {
      await enterPausing($, true)
      return withNote(pauseRequest(askAbove, lang))
    }
    if (current === 'paused') return withNote(isPerson ? pausedPersonNote(lang) : pausedMachineNote(lang))
    if (current === 'pausing') {
      // A turn interrupted before it read the appended request raises no Stop: the next prompt carries it whole.
      if (await read($, pauseDelivered)) return withNote(pausingNote(lang))
      await update($, pauseDelivered, () => true)
      return withNote(pauseRequest(askAbove, lang))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await settleTtl($, { minutes: e.cache_ttl === '5m' ? 5 : 60, source: 'model-switch' })
    await refreshThreshold($)
    return result
  }).catch(($, e, next) => next(e))

  // After /compact or the button: the summary Claude goes on with, as log lines the model does not read.
  on('session.compact', async ($, e, next) => {
    const before = (await read($, context))?.tokens ?? undefined
    const result = await next(e)
    if (e.trigger !== 'manual' && e.trigger !== 'plugin') return result
    if (result.skip !== undefined) return result

    const lang = await currentLang($)
    for (const line of compactionLines(result.messages, result.tokensBefore ?? before, result.tokensAfter, lang)) {
      $.ui.log(line)
    }

    await refreshContext($)
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements

    const at = Math.max(await read($, now), 0)
    const last = await read($, lastResponseAt)
    const life = await read($, ttl)
    const rate = await read($, lastHitRate)
    const fill = await read($, context)
    const limit = (await read($, threshold)) ?? { percent: FALLBACK_THRESHOLD_PERCENT, isFallback: true }
    const compacting = await read($, isCompacting)
    const lang = await currentLang($)
    const t = strings(lang)

    const share = remainingShare(last, life?.minutes ?? null, at)
    const sky = weather(fill?.percent ?? null, limit.percent)
    const isStorm = sky === '⛈️'
    // A terminal gets narrow signs: an emoji's width differs between terminals and Claude Code (see terminalWeather).
    const isTerminal = e.surface === 'terminal'
    const signs = pauseSigns(isTerminal)
    const terminalSky = terminalWeather(sky)
    const skyText = isTerminal ? <Text color={terminalSky.tone}>{terminalSky.sign}</Text> : <Text>{sky}</Text>
    const fillText = fill?.percent === null || fill?.percent === undefined ? '–' : `${fill.percent} %`

    const cacheText =
      share === null || last === null || life === null
        ? life === null
          ? t.cacheUnknown
          : t.cacheNone
        : share <= 0
          ? t.cacheExpired
          : t.cacheMinutes(remainingMinutes(last, life.minutes, at))
    const tone = share === null ? 'subtle' : cacheTone(share)
    // An expired cache leaves its readings stale: hits, context and threshold go until the next response.
    const isExpired = share !== null && share <= 0

    // Keep-alive's checkbox: the person's choice alone, the mod never switches it. Narrow signs in a terminal; in the
    // desktop app ☐ / ☑ (emoji were bigger but looked out of place, 2026-10-15). Beside it why keep-alive waits for the
    // next request, when it does.
    const isKeptAlive = await read($, keepAlive)
    const note = await read($, keepAliveNote)
    const refreshes = await read($, keepAliveRefreshes)
    const box = isTerminal ? (isKeptAlive ? '[✓]' : '[ ]') : isKeptAlive ? '☑' : '☐'
    const noteText =
      !isKeptAlive || note === null || life === null
        ? null
        : note === 'ended'
          ? t.keepAliveEnded(keepAliveSpanText(life.minutes))
          : t.keepAliveMissed
    const keepAliveControl = (
      <Box flexDirection="row" gap={1}>
        <Button
          key="keep-alive"
          label={`${box} ${t.keepAlive}${isKeptAlive && refreshes > 0 ? ` ↻${refreshes}` : ''}`}
          plain
          onPress={async () => setKeepAlive($, !(await read($, keepAlive)))}
        />
        {noteText === null ? null : (
          <Text color="warning" wrap="truncate-end">
            {noteText}
          </Text>
        )}
      </Box>
    )

    // The pause button: „Pause“, then what Claude is finishing up, then „Weitermachen“.
    const phase = await read($, pausePhase)
    let pause
    if (phase === 'running') {
      pause = <Button key="pause" label={`${signs.pause} ${t.pause}`} onPress={() => requestPause($, askAbove)} />
    } else if (phase === 'pausing') {
      const left = await read($, pauseTasksLeft)
      pause = (
        <Text color="warning" wrap="truncate-end">
          {`${signs.requested} ${t.pauseRequested}${t.tasksLeft(left)}`}
        </Text>
      )
    } else {
      const since = sinceText(await read($, pausedAt), at, lang)
      pause = (
        <Box flexDirection="row" gap={1}>
          <Button key="resume" label={`${signs.resume} ${t.resume}`} variant="primary" onPress={() => requestResume($)} />
          <Text color="success">{t.paused(since)}</Text>
        </Box>
      )
    }

    // The band is one site with a chain of hooks: what another mod beneath draws (savvy-progress' bar) goes under
    // ours; returning ours alone would hide it. A row's gap sets the two apart and only exists between them.
    const below = await next(e)
    const withBelow = (own: typeof below) =>
      below.type === 'engine' ? (
        own
      ) : (
        <Box flexDirection="column" rowGap={1}>
          {own}
          {below}
        </Box>
      )

    // The cache's time left as a line of its own over the band's width, coloured as the cache text: a terminal draws
    // it in line signs, the other surfaces as a picture a few pixels high.
    let bar = null
    if (isTerminal) {
      const cells = terminalBar(share, e.props.bodyColumns)
      bar = (
        <Box flexDirection="row">
          {cells.lit === '' ? null : <Text color={tone}>{cells.lit}</Text>}
          {cells.spent === '' ? null : <Text dimColor>{cells.spent}</Text>}
        </Box>
      )
    } else if ('Svg' in elements) {
      const { Svg } = elements
      bar = <Svg source={svgBar(share)} alt={t.cacheBarAlt(cacheText)} height={SVG_BAR_HEIGHT} />
    }

    const compact = (
      <Button
        key="compact"
        label={compacting ? t.compacting : t.compact}
        variant={isStorm ? 'primary' : 'secondary'}
        onPress={async () => {
          if (await read($, isCompacting)) return
          if (e.surface === 'desktop' || e.props.isWorking) {
            await queueCompact($)
            return
          }
          await update($, isCompacting, () => true)
          try {
            const result = await $.session.compact({})
            if (result.skip !== undefined) $.ui.toast(t.compactSkipped(result.skip))
          } catch {
            // A turn started in between: queue it instead.
            await queueCompact($)
          } finally {
            await update($, isCompacting, () => false)
          }
        }}
      />
    )

    const ttlNote = life === null ? '' : life.source === 'remembered' ? ` (${life.minutes === 60 ? '1 h' : '5 m'}?)` : ''
    return withBelow(
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text color={tone} wrap="truncate-end">
            {`${cacheText}${ttlNote}`}
          </Text>
          {keepAliveControl}
          {isExpired ? null : (
            <Text>
              {t.hits} {rate === null ? '–' : `${Math.round(rate * 100)} %`}
            </Text>
          )}
          {skyText}
          {isExpired ? null : (
            <Text>
              {t.ctx} {fillText} / {t.max} {limit.percent} %{limit.isFallback ? '*' : ''}
            </Text>
          )}
          {compact}
          {pause}
        </Box>
        {bar}
      </Box>,
    )
  })
}
