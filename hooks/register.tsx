import { atom, read, update } from 'claude-code'
import type { ClassicResultOf, EngineInterface, Register, Timer } from 'claude-code'

import type {
  ContextFill,
  KeepWarmNote,
  LiveSession,
  PausePhase,
  RunsDecision,
  SessionRequest,
  ShutdownMode,
  ShutdownPlan,
  ShutdownReadiness,
  Threshold,
  Ttl,
} from '../types'
import { langOf, modeWords, runtimeLocale, strings } from './i18n'
import type { Lang } from './i18n'
import {
  BUTTON_ICONS,
  FALLBACK_THRESHOLD_PERCENT,
  FORECAST_SHOW_TURNS,
  FORECAST_WARN_TURNS,
  cacheReadRatio,
  cacheTone,
  cacheWriteRatio,
  compactionLines,
  groupDigits,
  hitRate,
  isWarmRead,
  keepWarmBalance,
  missedKeepWarm,
  savingText,
  keepWarmHoursOf,
  keepWarmSpanText,
  keepWarmStep,
  lastResponseFromTranscript,
  lifetimeFromResume,
  pauseSigns,
  refreshCost,
  remainingMinutes,
  resetClock,
  usageStopping,
  usageToShow,
  remainingShare,
  svgBar,
  svgBarHeight,
  terminalBar,
  terminalWeather,
  thresholdPercent,
  ttlFromTranscript,
  turnsToCompact,
  weather,
  withGrowth,
} from './logic'
import {
  PAUSE_TOOL_NAME,
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
  pauseToolDescription,
  resumeContext,
  resumeText,
  runsInFlight,
  shutdownNote,
} from './pause'
import {
  HEARTBEAT_MS,
  RECENT_TRANSCRIPT_MS,
  SESSIONS_TOOL,
  SESSIONS_TOOL_NAME,
  asksToPause,
  folderOf,
  foreignPauseRequest,
  isAlive,
  isBusy,
  isSessionRequest,
  liveOthers,
  othersNote,
  questionRefusal,
  approvalRefusal,
  SCHEDULE_TOOL,
  SCHEDULE_TOOL_NAME,
  askWhenPrompt,
  planApprovalRefusal,
  planCancelledNote,
  planQuestionRefusal,
  planReminder,
  plannedNote,
  powerRefusal,
  scheduleLaterResult,
  scheduleToolDescription,
  timedPauseRequest,
  readDecisions,
  sessionsToolDescription,
  shortId,
  shutdownOthersPrompt,
  waitingFor,
  withoutForgotten,
} from './sessions'
import {
  PLAN_FOLLOW_MS,
  PLAN_GRACE_MS,
  PLAN_NEAR_MS,
  PLAN_REMINDER_MS,
  SCHEDULED_COUNTDOWN_MS,
  SHUTDOWN_COUNTDOWN_MS,
  UNIX_PROGRAMS,
  isPowerCommand,
  planTime,
  hasShutdownRight,
  hibernateCommand,
  hibernateEnabled,
  logindAllows,
  modeOf,
  osFromUname,
  readinessFits,
  secondsLeft,
  shutdownCommand,
  sleepCommand,
  standbyAvailable,
  windowsPowerShell,
  windowsSystem32,
} from './shutdown'

// Written at every load: which code a session runs, read off the state file on disk.
const CODE_VERSION = '0.11.0'

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
const keepWarm = atom({ plugin: 'cache-weather-and-pause-resume', key: 'keepWarm' } as const, false)
const cacheUsedAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'cacheUsedAt' } as const, null)
const activeAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'activeAt' } as const, null)
const keepWarmNote = atom({ plugin: 'cache-weather-and-pause-resume', key: 'keepWarmNote' } as const, null)
const usageWindows = atom({ plugin: 'cache-weather-and-pause-resume', key: 'usageWindows' } as const, [])
const keepWarmSpent = atom({ plugin: 'cache-weather-and-pause-resume', key: 'keepWarmSpent' } as const, 0)
const cacheGoneAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'cacheGoneAt' } as const, null)
const mainModel = atom({ plugin: 'cache-weather-and-pause-resume', key: 'mainModel' } as const, null)
const turnGrowths = atom({ plugin: 'cache-weather-and-pause-resume', key: 'turnGrowths' } as const, [])
const lastTurnTokens = atom({ plugin: 'cache-weather-and-pause-resume', key: 'lastTurnTokens' } as const, null)
const sessionsView = atom({ plugin: 'cache-weather-and-pause-resume', key: 'sessionsView' } as const, [])

// The pane of the sessions overview (0.10.0).
const SESSIONS_PANE = 'sessions'
const keepWarmRefreshes = atom({ plugin: 'cache-weather-and-pause-resume', key: 'keepWarmRefreshes' } as const, 0)
const isAwaitingPerson = atom({ plugin: 'cache-weather-and-pause-resume', key: 'isAwaitingPerson' } as const, false)
const isAwaitingApproval = atom({ plugin: 'cache-weather-and-pause-resume', key: 'isAwaitingApproval' } as const, false)
const shutdownPlan = atom({ plugin: 'cache-weather-and-pause-resume', key: 'shutdownPlan' } as const, null)
const planNotedId = atom({ plugin: 'cache-weather-and-pause-resume', key: 'planNotedId' } as const, null)
const planRemindedId = atom({ plugin: 'cache-weather-and-pause-resume', key: 'planRemindedId' } as const, null)
const planTold = atom({ plugin: 'cache-weather-and-pause-resume', key: 'planTold' } as const, null)
const planCancelPending = atom({ plugin: 'cache-weather-and-pause-resume', key: 'planCancelPending' } as const, null)
const shutdownCancelAsked = atom({ plugin: 'cache-weather-and-pause-resume', key: 'shutdownCancelAsked' } as const, null)
const permissionMode = atom({ plugin: 'cache-weather-and-pause-resume', key: 'permissionMode' } as const, null)
const shutdownReadiness = atom({ plugin: 'cache-weather-and-pause-resume', key: 'shutdownReadiness' } as const, null)
const isCheckingShutdown = atom({ plugin: 'cache-weather-and-pause-resume', key: 'isCheckingShutdown' } as const, false)
const shutdownPhase = atom({ plugin: 'cache-weather-and-pause-resume', key: 'shutdownPhase' } as const, 'idle')
const shutdownAt = atom({ plugin: 'cache-weather-and-pause-resume', key: 'shutdownAt' } as const, null)
const workingSince = atom({ plugin: 'cache-weather-and-pause-resume', key: 'workingSince' } as const, null)
const backgroundRuns = atom({ plugin: 'cache-weather-and-pause-resume', key: 'backgroundRuns' } as const, [])
const questionsClosed = atom({ plugin: 'cache-weather-and-pause-resume', key: 'questionsClosed' } as const, false)
const sessionRequest = atom({ plugin: 'cache-weather-and-pause-resume', key: 'sessionRequest' } as const, null)
const requestRole = atom({ plugin: 'cache-weather-and-pause-resume', key: 'requestRole' } as const, null)
const listedSessions = atom({ plugin: 'cache-weather-and-pause-resume', key: 'listedSessions' } as const, [])
const pausedByRequest = atom({ plugin: 'cache-weather-and-pause-resume', key: 'pausedByRequest' } as const, null)
const isIdlePause = atom({ plugin: 'cache-weather-and-pause-resume', key: 'isIdlePause' } as const, false)
const waitingSessions = atom({ plugin: 'cache-weather-and-pause-resume', key: 'waitingSessions' } as const, [])
const sessionsWithoutMod = atom({ plugin: 'cache-weather-and-pause-resume', key: 'sessionsWithoutMod' } as const, 0)

// The language before session.start has read the locale: the option, else the runtime's locale. Set by `register`.
let fallbackLang: Lang = 'en'

// What outlives a session (paused and kept-warm sessions by id, the cache lifetime last seen) lives in one file,
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
  /** The sessions keep-warm is switched on in, by id, with the time it was. */
  keepWarmSessions?: Record<string, number>
  /** The sessions it is switched off in (keep-warm is on by default, option `keepWarm`). */
  keepWarmOffSessions?: Record<string, number>
  codeVersion?: string
  /** Each session's sign of life, written by that session alone (0.9.4). */
  liveSessions?: Record<string, LiveSession>
  /** A shutdown planned for a time (0.11.0): any session shows it, cancels it, and fires it should its planner be gone. */
  shutdownPlan?: ShutdownPlan | null
  /** A shutdown under way that a band other than its own asked to cancel (0.11.0): the session that runs it cancels it
   * at its next look, and in any case right before the command. */
  shutdownCancel?: { requestId: string; at: number } | null
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
  const { context: c, rateLimits } = await $.session.usage()
  const fill: ContextFill = { percent: c.percent ?? null, tokens: c.tokens ?? null, window: c.window }
  await update($, context, () => fill)
  await update($, usageWindows, () => usageOf(rateLimits))
}

// The usage windows as the mod keeps them (0.10.0): kind, share used, when they start over.
function usageOf(windows: readonly { kind: string; percentUsed: number; resetsAt?: string }[] | undefined) {
  return (windows ?? []).map(w => ({
    kind: w.kind,
    percentUsed: w.percentUsed,
    ...(w.resetsAt === undefined ? {} : { resetsAt: w.resetsAt }),
  }))
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
  const t = strings(await currentLang($), shutdownMode)
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

// Drops the remembered pauses and keep-warms of sessions that are gone: no transcript `<id>.jsonl` in any project
// folder (the session was deleted). Unsure is never gone: an unreadable or empty projects folder drops nothing, and
// this session is kept.
async function pruneSessions($: EngineInterface): Promise<void> {
  const persisted = await readPersisted($)
  const keep = await read($, sessionId)
  const ids = [
    ...new Set([
      ...Object.keys(persisted.pausedSessions ?? {}),
      ...Object.keys(persisted.keepWarmSessions ?? {}),
      ...Object.keys(persisted.keepWarmOffSessions ?? {}),
    ]),
  ].filter(id => id !== keep)
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
    const warm = { ...(p.keepWarmSessions ?? {}) }
    const cold = { ...(p.keepWarmOffSessions ?? {}) }
    for (const id of gone) {
      delete paused[id]
      delete warm[id]
      delete cold[id]
    }
    return { ...p, pausedSessions: paused, keepWarmSessions: warm, keepWarmOffSessions: cold }
  })
}

// The state file as it stands: none yet, read, or not readable (a write of another session under way, or broken).
type StateFile = { kind: 'missing' } | { kind: 'read'; value: Persisted } | { kind: 'unreadable' }

async function readStateFile($: EngineInterface): Promise<StateFile> {
  const home = await homeDir($)
  if (home === null) return { kind: 'missing' }
  try {
    if (!(await $.fs.exists(`${home}/.claude/cache-weather-and-pause-resume/state.json`))) return { kind: 'missing' }
    const value: unknown = JSON.parse(await $.fs.read(`${home}/.claude/cache-weather-and-pause-resume/state.json`))
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? { kind: 'read', value: value as Persisted }
      : { kind: 'unreadable' }
  } catch {
    return { kind: 'unreadable' }
  }
}

async function readPersisted($: EngineInterface): Promise<Persisted> {
  let found = await readStateFile($)
  // Caught in the middle of another session's write: once more, a moment later.
  if (found.kind === 'unreadable') found = await readStateFile($)
  return found.kind === 'read' ? found.value : {}
}

// Several sessions write the file, each by reading it, changing it and writing it whole (0.9.2). Two that read it at
// once lose one change: the second write puts back what it read. So each write is looked at again a moment later and
// made again where its change is gone; a file that does not parse is someone's write under way and is read again
// rather than written over, until it stays broken through every try. Keys of earlier versions go with the next write.
const WRITE_CHECKS = 3
const WRITE_CHECK_MS = 250
const UNREADABLE_TRIES = 4
const UNREADABLE_RETRY_MS = 150
const DEAD_KEYS = ['isCollapsed', 'keepAliveSessions']

const stateText = (value: Persisted): string => `${JSON.stringify(value, null, 2)}\n`

function withoutDeadKeys(value: Persisted): Persisted {
  const next: Record<string, unknown> = { ...value }
  for (const key of DEAD_KEYS) delete next[key]
  return next as Persisted
}

async function writePersisted($: EngineInterface, change: (p: Persisted) => Persisted): Promise<void> {
  await writeStateFile($, change, WRITE_CHECKS, UNREADABLE_TRIES)
}

// One try: what the file holds with the change made. A change already in writes nothing, which also ends the checks.
async function writeStateFile(
  $: EngineInterface,
  change: (p: Persisted) => Persisted,
  checksLeft: number,
  unreadableLeft: number,
): Promise<void> {
  const home = await homeDir($)
  if (home === null) return
  const found = await readStateFile($)
  if (found.kind === 'unreadable' && unreadableLeft > 0) {
    $.clock.after(UNREADABLE_RETRY_MS, () => {
      void writeStateFile($, change, checksLeft, unreadableLeft - 1).catch(() => undefined)
    })
    return
  }
  const before = found.kind === 'read' ? found.value : {}
  const text = stateText(withoutDeadKeys(change(before)))
  if (found.kind === 'read' && text === stateText(before)) return
  try {
    await $.fs.write(`${home}/.claude/cache-weather-and-pause-resume/state.json`, text)
  } catch {
    // Not writable: the value lives in this session's state alone.
    return
  }
  if (checksLeft > 0) {
    $.clock.after(WRITE_CHECK_MS, () => {
      void writeStateFile($, change, checksLeft - 1, UNREADABLE_TRIES).catch(() => undefined)
    })
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

// ── Keep-warm ────────────────────────────────────────────────────────────────────────────────────────────────────

// Shortly before the cache lapses, keep-warm asks one question over the conversation as its last request sent it
// ($.model.fork): the API serves that from the cache, which keeps the cache warm for another lifetime. The question
// and its answer stay out of the conversation, and the fork may call no tool. A refresh reads the whole context from
// the cache, so a session nobody works in is kept warm for a while only (keepWarmSpanMs).
const KEEP_WARM_PROMPT =
  'Automated keep-warm request of the cache-weather-and-pause-resume mod: it only keeps the prompt cache warm, and ' +
  'your reply is discarded. Reply with OK and nothing else.'
// How often keep-warm looks whether a refresh is due; the earliest refresh is a minute before the cache lapses.
const KEEP_WARM_CHECK_MS = 15_000
// After a refresh that failed (an API error), the next try waits this long.
const KEEP_WARM_RETRY_MS = 30_000
// The notices of Claude Code (`notification_type`) that mean a dialog waits for the person.
const WAITING_NOTICES = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog'])

// The module's own: a reload starts them over, and its timers go with the old module.
let keepWarmByDefault = true
// How long keep-warm goes on for the hour's cache in a session nobody works in (option `keepWarmHours`, 0.10.0).
let keepWarmHours = 8
let isNotifying = true
// What the button does once the sessions are paused (option `shutdownMode`, 0.9.5).
let shutdownMode: ShutdownMode = 'shutdown'
let shutdownCheck: Promise<void> | null = null
let shutdownTimer: Timer | null = null
let shutdownTicker: Timer | null = null
let pauseToolRegistered = false
let keepWarmStarted = false
let tickerStarted = false
let heartbeatStarted = false
let sessionsToolRegistered = false
let scheduleToolRegistered = false
// Another session's shutdown under way, read every second (0.11.0).
let foreignWatch: Timer | null = null
// A plan's time near or just past: plan and request looked at every second (0.11.0).
let nearPlanWatch: Timer | null = null
// One look at plan and request at a time: the 15-second look and the second-by-second one never overlap.
let isLooking = false
// The other session's request this module has taken up already: it is not taken up twice.
let handledRequestId: string | null = null
// When this module first saw its session start: a request decided before is no concern of it.
let moduleStartedAt: number | null = null
let isRefreshing = false
// The window keep-warm last said it stops for, until it starts over: said once, not after every input.
let usageStopSaid: string | null = null
let retryAt = 0

// Redraws the band once a minute: the cache's countdown and how long the session has been paused. Started by the
// first start the module sees, session.start or classic.SessionStart, whichever comes.
function startTicker($: EngineInterface): void {
  if (tickerStarted) return
  tickerStarted = true
  $.clock.every(60_000, () => {
    void tick($)
  })
}

function startKeepWarm($: EngineInterface): void {
  if (keepWarmStarted) return
  keepWarmStarted = true
  $.clock.every(KEEP_WARM_CHECK_MS, () => {
    void keepWarmTick($).catch(() => undefined)
  })
}

// A response of the conversation's own, or the person's input (switching keep-warm on, answering a question): the
// idle span starts over, and with a response the cache was read when its request went out.
// Some of keep-warm's rules follow cachebeat (github.com/ARahim3/cachebeat): only answered requests count, nothing
// is kept warm after a compaction or a switch of model, and waiting for the person is idle.
async function markActive($: EngineInterface, at: number, isRequest: boolean): Promise<void> {
  if (isRequest) await update($, cacheUsedAt, () => at)
  await update($, activeAt, () => at)
  await update($, keepWarmNote, () => null)
  await update($, keepWarmRefreshes, () => 0)
  await update($, keepWarmSpent, () => 0)
}

// The person is back and the conversation's own request read the cache that keep-warm kept: what the refreshes cost,
// set against the rebuild they spared (0.10.0). Drawn once, before the new idle span starts.
async function drawBalance(
  $: EngineInterface,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number },
): Promise<void> {
  const spent = await read($, keepWarmSpent)
  const refreshes = await read($, keepWarmRefreshes)
  const life = await read($, ttl)
  if (spent <= 0 || refreshes <= 0 || life === null) return
  const balance = keepWarmBalance({
    spent,
    readTokens: usage.cache_read_input_tokens,
    readRatio: cacheReadRatio(await sessionModel($)),
    writeRatio: cacheWriteRatio(life.minutes),
  })
  if (balance === null) return
  const lang = await currentLang($)
  // What it saved first, a positive note (0.10.1); where it cost more, by how much.
  const saving = savingText(balance)
  $.ui.log(
    strings(lang, shutdownMode).keepWarmBalanceLog(refreshes, groupDigits(Math.abs(saving.tokens), lang), saving.percent),
  )
}

// The session's model, which sets what a cache read costs: the one its last request named, else the session's own
// (a resumed session names none before its first request); null where neither answers.
async function sessionModel($: EngineInterface): Promise<string | null> {
  const known = await read($, mainModel)
  if (known !== null) return known
  try {
    const model = await $.session.model()
    await update($, mainModel, () => model)
    return model
  } catch {
    return null
  }
}

// Where the refreshes went unused (keep-warm ended, or found the cache gone): what they cost, once (0.10.0).
async function logWasted($: EngineInterface): Promise<void> {
  const spent = await read($, keepWarmSpent)
  const refreshes = await read($, keepWarmRefreshes)
  if (spent <= 0 || refreshes <= 0) return
  const lang = await currentLang($)
  $.ui.log(strings(lang, shutdownMode).keepWarmWastedLog(refreshes, groupDigits(spent, lang)))
  await update($, keepWarmSpent, () => 0)
}

// Refreshes count as unused only once the cache they kept lapses with no request (0.10.1): keep-warm ended, was
// switched off, or stopped for a usage window. Until then going on still reads it, as the last refresh's line says.
async function settleUnused($: EngineInterface): Promise<void> {
  if ((await read($, keepWarmRefreshes)) <= 0 || (await read($, keepWarmSpent)) <= 0) return
  const life = await read($, ttl)
  const last = await read($, lastResponseAt)
  if (life === null || last === null) return
  if ((await $.clock.now()) >= last + life.minutes * 60_000) await logWasted($)
}

// Keep-warm was off and the cache lapsed before this request wrote it again: what keep-warm would have saved, once
// (0.10.1). Measured on the request: what it wrote, over the gap since the response before.
async function drawMissedSaving(
  $: EngineInterface,
  usage: { cache_creation_input_tokens: number },
  sentAt: number,
): Promise<void> {
  if ((await read($, keepWarm)) || (await read($, keepWarmRefreshes)) > 0) return
  // After a compaction or a switch of model the request writes the cache anyway: no lapse keep-warm could have bridged.
  if ((await read($, cacheGoneAt)) !== null) return
  const life = await read($, ttl)
  const last = await read($, lastResponseAt)
  if (life === null || last === null) return
  const missed = missedKeepWarm({
    gapMs: sentAt - last,
    ttlMinutes: life.minutes,
    hours: keepWarmHours,
    cachedTokens: usage.cache_creation_input_tokens,
    readRatio: cacheReadRatio(await sessionModel($)),
    writeRatio: cacheWriteRatio(life.minutes),
  })
  if (missed === null) return
  const lang = await currentLang($)
  const saving = savingText(missed)
  $.ui.log(strings(lang, shutdownMode).keepWarmWouldHaveLog(saving.percent, groupDigits(saving.tokens, lang), missed.refreshes))
}

async function keepWarmTick($: EngineInterface): Promise<void> {
  if (isRefreshing) return
  await settleUnused($)
  if (!(await read($, keepWarm))) return
  // A usage window at or past 90 %: no refresh spends the last of it (0.10.0). Once it starts over, keep-warm goes on.
  const stopping = usageStopping(await read($, usageWindows))
  const held = await read($, keepWarmNote)
  if (stopping !== null) {
    if (held === null) await update($, keepWarmNote, () => 'limit')
    const said = `${stopping.kind}@${stopping.resetsAt ?? ''}`
    if (usageStopSaid !== said) {
      usageStopSaid = said
      const t = strings(await currentLang($), shutdownMode)
      $.ui.log(t.keepWarmLimitLog(t.usageWindow(stopping.kind), Math.round(stopping.percentUsed)))
    }
    return
  }
  usageStopSaid = null
  if (held === 'limit') await update($, keepWarmNote, () => null)
  else if (held !== null) return
  const at = await $.clock.now()
  if (at < retryAt) return
  const life = await read($, ttl)
  const last = await read($, lastResponseAt)
  // A resumed session knows its last response alone: the idle span starts there, and stays put as refreshes come.
  if ((await read($, activeAt)) === null && last !== null) await update($, activeAt, () => last)
  const step = keepWarmStep({
    cacheUsedAt: (await read($, cacheUsedAt)) ?? last,
    activeAt: (await read($, activeAt)) ?? last,
    ttlMinutes: life?.minutes ?? null,
    // Claude waiting for the person (a permission prompt, a question) is no work: left open overnight it would keep
    // refreshing without end.
    isWorking:
      !(await read($, isAwaitingPerson)) &&
      ((await read($, turnRunning)) || (await read($, pausePhase)) === 'pausing'),
    now: at,
    hours: keepWarmHours,
  })
  const lang = await currentLang($)
  const t = strings(lang, shutdownMode)
  if (step === 'ended' && life !== null) {
    await update($, keepWarmNote, () => 'ended')
    $.ui.log(t.keepWarmEndedLog(keepWarmSpanText(life.minutes, keepWarmHours), life.minutes === 60 ? '1-h' : '5-m'))
    // The cache it kept stays warm for its lifetime: going on before then still reads it (0.10.1). Unused they are once
    // it lapses (settleUnused).
    return
  }
  if (step !== 'refresh') return

  isRefreshing = true
  try {
    const result = await $.model.fork({ prompt: KEEP_WARM_PROMPT })
    if (!result.isAnswered && result.reason === 'nothing-to-fork') {
      await update($, keepWarmNote, () => 'missed')
      return
    }
    const usage = result.usage
    const cost = refreshCost(usage, cacheReadRatio(await sessionModel($)), cacheWriteRatio(life?.minutes ?? 60))
    if (isWarmRead(usage)) {
      await update($, keepWarmSpent, n => n + cost)
      const spent = await read($, keepWarmSpent)
      await update($, cacheUsedAt, () => at)
      await update($, lastResponseAt, () => at)
      await update($, now, () => at)
      await update($, keepWarmRefreshes, n => n + 1)
      // What continuing now would save (0.10.1): the next request reads what this one read, instead of writing it.
      const balance = keepWarmBalance({
        spent,
        readTokens: usage.cache_read_input_tokens,
        readRatio: cacheReadRatio(await sessionModel($)),
        writeRatio: cacheWriteRatio(life?.minutes ?? 60),
      })
      const saving = balance === null || balance.saved <= 0 ? null : savingText(balance)
      $.ui.log(
        t.keepWarmRefreshedLog(
          groupDigits(usage.cache_read_input_tokens, lang),
          groupDigits(usage.output_tokens, lang),
          saving === null ? null : { percent: saving.percent, tokens: groupDigits(saving.tokens, lang) },
        ),
      )
    } else if (usage.input_tokens + usage.cache_creation_input_tokens > 0) {
      // Answered, but not from the cache: it had lapsed. The next request of the conversation builds it again.
      await update($, keepWarmNote, () => 'missed')
      $.ui.log(t.keepWarmMissedLog)
      await update($, keepWarmSpent, n => n + cost)
      await logWasted($)
    } else {
      retryAt = at + KEEP_WARM_RETRY_MS
    }
  } finally {
    isRefreshing = false
  }
}

// The person's switch, for this session alone: kept under its id, so a restart or a resume keeps it; a new session
// (`/clear` too) starts as the option `keepWarm` says, on unless set to off.
async function setKeepWarm($: EngineInterface, value: boolean): Promise<void> {
  await update($, keepWarm, () => value)
  const at = await $.clock.now()
  if (value) await markActive($, at, false)
  const id = await currentSessionId($)
  if (id === null) return
  await writePersisted($, p => ({
    ...p,
    keepWarmSessions: withSession(p.keepWarmSessions, id, value ? at : null),
    keepWarmOffSessions: withSession(p.keepWarmOffSessions, id, value ? null : at),
  }))
}

async function restoreKeepWarm($: EngineInterface, id: string): Promise<void> {
  const persisted = await readPersisted($)
  const isOn =
    persisted.keepWarmOffSessions?.[id] !== undefined
      ? false
      : persisted.keepWarmSessions?.[id] !== undefined
        ? true
        : keepWarmByDefault
  await update($, keepWarm, () => isOn)
}

// ── The shutdown button ───────────────────────────────────────────────────────────────────────────────────────────

// Whether the computer can be shut down with nobody at the keyboard: the button shows dimmed, and says what is
// missing, until it can. Checked at a session start (a /clear and a resume too) where the band holds no answer yet,
// and at a press that finds none or a failed check (`force`): the answer lives with the session, the module outlives
// it, so a flag of the module's own would leave a session after /clear without one (0.9.1). A check under way is
// shared, never run twice. The programs it starts read and change nothing: `whoami /priv` (Windows), else `uname -s`,
// then `loginctl can-power-off` (Linux) and `sudo -n -l shutdown`, which asks for no password and runs nothing.
function checkShutdown($: EngineInterface, force = false): Promise<void> {
  if (shutdownCheck !== null) return shutdownCheck
  const check = (async () => {
    if (!force && readinessFits(await read($, shutdownReadiness), shutdownMode)) return
    // The answer holds the mode it was checked for: a change of the option checks again (0.9.5).
    const mode = shutdownMode
    let readiness: ShutdownReadiness
    try {
      readiness = { ...(await detectShutdown($)), mode }
    } catch {
      readiness = { isReady: false, os: 'unknown', reason: 'check-failed', mode }
    }
    await update($, shutdownReadiness, () => readiness)
  })()
  shutdownCheck = check
  void check
    .catch(() => undefined)
    .then(() => {
      if (shutdownCheck === check) shutdownCheck = null
    })
  return check
}

// The answer a press acts on: the one at hand, or, where there is none or the check failed, a check made now.
async function shutdownReadinessNow($: EngineInterface): Promise<ShutdownReadiness> {
  const held = await read($, shutdownReadiness)
  if (held !== null && readinessFits(held, shutdownMode) && (held.isReady || held.reason !== 'check-failed')) return held
  // The status row says so meanwhile.
  await update($, isCheckingShutdown, () => true)
  try {
    await checkShutdown($, true)
  } catch {
    // Not written: told below as a failed check.
  } finally {
    await update($, isCheckingShutdown, () => false).catch(() => undefined)
  }
  return (await read($, shutdownReadiness)) ?? { isReady: false, os: 'unknown', reason: 'check-failed' }
}

// Each program by its full path, from a system folder as the working folder: nothing the session's folder holds runs.
async function detectShutdown($: EngineInterface): Promise<ShutdownReadiness> {
  const mode = shutdownMode
  if ((await $.env.get('OS')) === 'Windows_NT') {
    const system32 = windowsSystem32(await $.env.get('SystemRoot'))
    const priv = await $.process.run([`${system32}\\whoami.exe`, '/priv'], { cwd: system32, timeoutMs: 10_000 })
    if (!hasShutdownRight(priv.stdout)) return { isReady: false, os: 'windows', reason: 'no-right' }
    // Hibernation: whether Windows has it on, read off the registry value, which no language words.
    if (mode === 'hibernate') {
      const power = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power'
      const reg = await $.process.run([`${system32}\\reg.exe`, 'query', power, '/v', 'HibernateEnabled'], { cwd: system32, timeoutMs: 10_000 })
      return hibernateEnabled(reg.stdout)
        ? { isReady: true, os: 'windows', command: hibernateCommand('windows', `${system32}\\shutdown.exe`) }
        : { isReady: false, os: 'windows', reason: 'no-hibernate' }
    }
    // Standby: whether `powercfg /a` lists S3 or S0 as available.
    if (mode === 'sleep') {
      const states = await $.process.run([`${system32}\\powercfg.exe`, '/a'], { cwd: system32, timeoutMs: 10_000 })
      return standbyAvailable(states.stdout)
        ? { isReady: true, os: 'windows', command: sleepCommand('windows', windowsPowerShell(system32)) }
        : { isReady: false, os: 'windows', reason: 'no-sleep' }
    }
    return { isReady: true, os: 'windows', command: shutdownCommand('windows', false, `${system32}\\shutdown.exe`) }
  }
  const uname = await unixProgram($, 'uname')
  if (uname === null) return { isReady: false, os: 'unknown', reason: 'unknown-os' }
  const os = osFromUname((await $.process.run([uname, '-s'], { cwd: '/', timeoutMs: 10_000 })).stdout)
  if (os === null) return { isReady: false, os: 'unknown', reason: 'unknown-os' }
  if (mode !== 'shutdown') return detectSleep($, os, mode)
  if (os === 'linux') {
    const loginctl = await unixProgram($, 'loginctl')
    const systemctl = await unixProgram($, 'systemctl')
    if (loginctl !== null && systemctl !== null) {
      try {
        const logind = await $.process.run([loginctl, 'can-power-off'], { cwd: '/', timeoutMs: 10_000 })
        if (logind.exitCode === 0 && logindAllows(logind.stdout)) {
          return { isReady: true, os, command: shutdownCommand(os, true, systemctl) }
        }
      } catch {
        // systemd-logind does not answer: sudo may still allow it.
      }
    }
  }
  const sudo = await unixProgram($, 'sudo')
  if (sudo !== null) {
    try {
      const allowed = await $.process.run([sudo, '-n', '-l', 'shutdown'], { cwd: '/', timeoutMs: 10_000 })
      if (allowed.exitCode === 0) return { isReady: true, os, command: shutdownCommand(os, false, sudo) }
    } catch {
      // sudo does not answer.
    }
  }
  return { isReady: false, os, reason: 'no-permission' }
}

// Standby and hibernation on Linux through systemd-logind, as far as it lets the session; on macOS standby through
// pmset (hibernation is a setting there, not a command).
async function detectSleep($: EngineInterface, os: 'linux' | 'macos', mode: 'sleep' | 'hibernate'): Promise<ShutdownReadiness> {
  const missing: ShutdownReadiness = { isReady: false, os, reason: mode === 'sleep' ? 'no-sleep' : 'no-hibernate' }
  if (os === 'macos') {
    if (mode === 'hibernate') return missing
    const pmset = await unixProgram($, 'pmset')
    return pmset === null ? missing : { isReady: true, os, command: sleepCommand(os, pmset) }
  }
  const loginctl = await unixProgram($, 'loginctl')
  const systemctl = await unixProgram($, 'systemctl')
  if (loginctl === null || systemctl === null) return missing
  try {
    const answer = await $.process.run([loginctl, mode === 'sleep' ? 'can-suspend' : 'can-hibernate'], { cwd: '/', timeoutMs: 10_000 })
    if (answer.exitCode === 0 && logindAllows(answer.stdout)) {
      return { isReady: true, os, command: mode === 'sleep' ? sleepCommand(os, systemctl) : hibernateCommand(os, systemctl) }
    }
  } catch {
    // systemd-logind does not answer.
  }
  return missing
}

async function unixProgram($: EngineInterface, name: keyof typeof UNIX_PROGRAMS): Promise<string | null> {
  for (const path of UNIX_PROGRAMS[name]) {
    try {
      if (await $.fs.exists(path)) return path
    } catch {
      // Not readable: try the next place.
    }
  }
  return null
}

// The button: first when (0.11.0). Claude asks the person, who is at the keyboard (a question gets through even in a
// pause), and passes the answer to schedule_shutdown: as soon as possible, or at a time. Pressed where it cannot, it
// says what is missing.
async function requestShutdown($: EngineInterface): Promise<void> {
  const lang = await currentLang($)
  const t = strings(lang, shutdownMode)
  const readiness = await shutdownReadinessNow($)
  if (!readiness.isReady) {
    $.ui.toast(t.shutdownHelp(readiness))
    $.ui.log(t.shutdownHelp(readiness))
    return
  }
  if ((await read($, shutdownPhase)) !== 'idle' || (await livePlan($)) !== null) return
  await update($, shutdownPhase, () => 'asking')
  await update($, questionsClosed, () => false)
  await handToModel($, askWhenPrompt(lang, shutdownMode))
}

// As soon as possible: pause as the pause button does, telling Claude to ask its questions now, then count down and
// shut the computer down. Paused already, it counts down at once. Answers what Claude reads next.
async function shutdownNow($: EngineInterface, askAbove: number): Promise<string> {
  const lang = await currentLang($)
  const phase = await read($, pausePhase)
  await update($, shutdownPhase, () => 'requested')
  // The other sessions go down with this one: where some have work running, Claude asks the person about it first.
  const others = await prepareRequest($, 'shutdown')
  if (phase === 'running') {
    await enterPausing($, true)
    const parts = [pauseRequest(askAbove, lang), shutdownNote(lang, shutdownMode)]
    if (others.note !== null) parts.push(others.note)
    return parts.join('\n\n')
  }
  if (phase === 'paused') {
    if (others.busy.length > 0) return shutdownOthersPrompt(others.busy, others.at, lang, shutdownMode)
    await beginShutdownWait($)
    return 'The session is paused already: the band counts down and then goes ahead. Report that briefly.'
  }
  // A pause under way: Claude learns that the computer goes off after it.
  const note = shutdownNote(lang, shutdownMode)
  return others.note === null ? note : `${note}\n\n${others.note}`
}

// ── A shutdown planned for a time (0.11.0) ──────────────────────────────────────────────────────────────────────────

async function notePermissionMode($: EngineInterface, mode: unknown): Promise<void> {
  if (typeof mode === 'string' && mode !== '') await update($, permissionMode, () => mode)
}

// The modes in which an ask surely comes up as a prompt to the person: there tool.check turns it away early. The mode
// is a hint only (the person may switch it for the next prompt, and auto mode may still ask, after repository rules or
// settings hooks): every prompt that does come up is turned away at classic.PermissionRequest, in any mode.
const ASKING_MODES = new Set(['default', 'plan', 'acceptEdits'])

async function surelyAsks($: EngineInterface): Promise<boolean> {
  const mode = await read($, permissionMode)
  return mode !== null && ASKING_MODES.has(mode)
}

// Why an approval waits, should it now: a shutdown planned (from the plan on, in every session), or a pause asked for
// or on (from the press on). Null while the session works as usual.
async function heldApproval($: EngineInterface): Promise<string | null> {
  const lang = await currentLang($)
  const planned = await livePlan($)
  if (planned !== null) return planApprovalRefusal(clockOf(planned.at), lang, planned.mode)
  if ((await read($, pausePhase)) === 'running' && !(await read($, questionsClosed))) return null
  return approvalRefusal(lang)
}

/** The plan as the band knows it, unless it fired: then the shutdown request stands in its place. */
async function livePlan($: EngineInterface): Promise<ShutdownPlan | null> {
  const plan = await read($, shutdownPlan)
  return plan === null || plan.firedAt !== undefined ? null : plan
}

// A plan's time as "HH:MM": it lies within a day, so the next time that comes is meant, tomorrow's included.
function clockOf(at: number): string {
  const time = new Date(at)
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

function untilText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours === 0 ? `${minutes} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

async function isWorkingNow($: EngineInterface): Promise<boolean> {
  return (await read($, turnRunning)) || (await read($, backgroundRuns)).length > 0
}

// schedule_shutdown: now goes the way the button always went; later becomes a plan in the state file, which every
// session shows and follows. Answers what Claude reads.
async function scheduleShutdown(
  $: EngineInterface,
  input: { when?: unknown; at?: unknown; inMinutes?: unknown },
  askAbove: number,
): Promise<string> {
  const lang = await currentLang($)
  const t = strings(lang, shutdownMode)
  const w = modeWords(shutdownMode, 'en')
  const at = await $.clock.now()
  const planned = (await readPersisted($)).shutdownPlan ?? null
  if (planned !== null && planned.firedAt === undefined) {
    return `Nothing changed: the mod will already ${modeWords(planned.mode, 'en').doIt} at ${clockOf(planned.at)}. The person can cancel that in the band.`
  }
  const phase = await read($, shutdownPhase)
  if (phase !== 'idle' && phase !== 'asking') return `Nothing changed: the mod is about to ${w.doIt} already.`
  const readiness = await shutdownReadinessNow($)
  if (!readiness.isReady) {
    await update($, shutdownPhase, () => 'idle')
    return `Not possible now: ${t.shutdownHelp(readiness)} Tell the person this.`
  }
  const time = input.when === 'later' ? planTime(input, at) : null
  if (input.when === 'later' && time === null) {
    await update($, shutdownPhase, () => 'idle')
    return 'Nothing changed: the time did not read as "HH:MM" (24 hours) or a number of minutes within a day. Ask the person again, or call with when "now".'
  }
  // A time a minute or two off is as soon as possible.
  if (time === null || time - at < 2 * 60_000) return `Recorded: the mod will ${w.doIt} as soon as possible.\n\n${await shutdownNow($, askAbove)}`
  const self = await currentSessionId($)
  const plan: ShutdownPlan = {
    id: `${self ?? 'session'}-${at}`,
    at: time,
    mode: shutdownMode,
    by: self ?? '',
    byFolder: await currentFolder($),
    createdAt: at,
  }
  await writePersisted($, p => ({ ...p, shutdownPlan: plan }))
  await update($, shutdownPlan, () => plan)
  await update($, planNotedId, () => plan.id)
  await told($, plan)
  // Planned closer than the reminder's half hour: the plan itself said what to do.
  if (time - at <= PLAN_REMINDER_MS) await update($, planRemindedId, () => plan.id)
  await update($, shutdownPhase, () => 'idle')
  return scheduleLaterResult(clockOf(time), untilText(time - at), shutdownMode)
}

// The cancel button of a plan, in any session. The plan as the state file holds it: fired meanwhile (here or in the
// session that took it over), the button cancels the shutdown under way instead (live, 0.11.0).
async function cancelPlan($: EngineInterface): Promise<void> {
  const plan = (await readPersisted($)).shutdownPlan ?? null
  if (plan === null) return
  if (plan.firedAt !== undefined) {
    await cancelShutdownAnywhere($)
    return
  }
  await writePersisted($, p => (p.shutdownPlan?.id === plan.id ? { ...p, shutdownPlan: null } : p))
  await update($, shutdownPlan, () => null)
  await update($, planNotedId, () => null)
  await update($, planRemindedId, () => null)
  $.ui.toast(strings(await currentLang($), plan.mode).planCancelled)
  await noteCancelled($, plan)
}

// A cancel button for a shutdown under way, in any band: this session's own is cancelled at once; another session's
// is marked in the state file, which that session reads at its next look and right before the command (0.11.0).
async function cancelShutdownAnywhere($: EngineInterface): Promise<void> {
  if ((await read($, requestRole)) === 'own' && (await read($, shutdownPhase)) !== 'idle') {
    await cancelShutdown($, false)
    return
  }
  const request = await readRequest($)
  if (request === null || request.kind !== 'shutdown' || !isUnderWay(request)) return
  const at = await $.clock.now()
  await writePersisted($, p => ({ ...p, shutdownCancel: { requestId: request.id, at } }))
  await update($, shutdownCancelAsked, () => request.id)
  $.ui.toast(strings(await currentLang($), request.mode ?? 'shutdown').shutdownCancelled)
}

function isUnderWay(request: SessionRequest): boolean {
  return request.state === 'open' || request.state === 'decided' || request.state === 'countdown'
}

// Whether a band asked to cancel this session's own shutdown.
async function isCancelAsked($: EngineInterface): Promise<boolean> {
  const own = await read($, sessionRequest)
  if (own === null || own.kind !== 'shutdown' || !isUnderWay(own)) return false
  return (await readPersisted($)).shutdownCancel?.requestId === own.id
}

// The model was told of this plan (by the tool's result, a note or a prompt's context): an older cancel is moot.
async function told($: EngineInterface, plan: ShutdownPlan): Promise<void> {
  await update($, planTold, () => ({ id: plan.id, mode: plan.mode }))
  await update($, planCancelPending, () => null)
}

// A plan called off, here or in another session: a model that was told of it hears so, now if the session works,
// else with its next turn, so it does not end its work for a shutdown that will not come (live, 0.11.0).
async function noteCancelled($: EngineInterface, plan: ShutdownPlan): Promise<void> {
  if ((await read($, planTold))?.id !== plan.id) return
  await update($, planTold, () => null)
  await update($, planCancelPending, () => plan.mode)
  await deliverCancel($)
}

async function deliverCancel($: EngineInterface): Promise<void> {
  const mode = await read($, planCancelPending)
  if (mode === null || (await livePlan($)) !== null || !(await isWorkingNow($))) return
  await update($, planCancelPending, () => null)
  await handToModel($, planCancelledNote(await currentLang($), mode))
}

// Every HEARTBEAT_MS: the plan as the state file holds it. A session at work is told of it once and reminded half an
// hour before; at its time the planner fires it, or, the planner gone, one other session that took it over. A plan
// nobody fired within PLAN_GRACE_MS of its time lapses: the computer was off or asleep.
async function followPlan($: EngineInterface): Promise<void> {
  const persisted = await readPersisted($)
  const plan = persisted.shutdownPlan ?? null
  const before = await read($, shutdownPlan)
  if (JSON.stringify(before) !== JSON.stringify(plan)) await update($, shutdownPlan, () => plan)
  const at = await $.clock.now()
  const lang = await currentLang($)
  if (plan === null) {
    // Called off (a plan that fired leads to the pause instead): a session told of it hears so.
    if (before !== null && before.firedAt === undefined) await noteCancelled($, before)
    await deliverCancel($)
    if ((await read($, planNotedId)) === null) return
    await update($, planNotedId, () => null)
    await update($, planRemindedId, () => null)
    return
  }
  if (plan.firedAt !== undefined) {
    if (at - plan.firedAt > PLAN_GRACE_MS) await writePersisted($, p => (p.shutdownPlan?.id === plan.id ? { ...p, shutdownPlan: null } : p))
    return
  }
  if (at > plan.at + PLAN_GRACE_MS) {
    await writePersisted($, p => (p.shutdownPlan?.id === plan.id ? { ...p, shutdownPlan: null } : p))
    $.ui.log(strings(lang, plan.mode).planLapsed(clockOf(plan.at)))
    return
  }
  const self = await currentSessionId($)
  const clock = clockOf(plan.at)
  if ((await read($, planNotedId)) !== plan.id) {
    await update($, planNotedId, () => plan.id)
    if (plan.by !== self && (await isWorkingNow($))) {
      await told($, plan)
      await handToModel($, plannedNote(clock, plan.byFolder, lang, plan.mode))
    }
  }
  if (plan.at - at <= PLAN_NEAR_MS) watchNearPlan($)
  if (at < plan.at) {
    const isReminderDue = at >= plan.at - PLAN_REMINDER_MS && plan.at - plan.createdAt > PLAN_REMINDER_MS
    if (isReminderDue && (await read($, planRemindedId)) !== plan.id) {
      await update($, planRemindedId, () => plan.id)
      if (await isWorkingNow($)) await handToModel($, planReminder(clock, lang, plan.mode))
    }
    return
  }
  await firePlan($, plan, persisted, self, at)
}

async function firePlan(
  $: EngineInterface,
  plan: ShutdownPlan,
  persisted: Persisted,
  self: string | null,
  at: number,
): Promise<void> {
  if (self === null) return
  if (plan.by !== self) {
    const planner = persisted.liveSessions?.[plan.by]
    if (planner !== undefined && isAlive(planner, at)) return
    // The planner is gone: one session takes it over, and fires it at the next tick should its claim have held.
    const claimer = plan.firedBy
    const claimerGone = claimer !== undefined && claimer !== self && !isAliveId(persisted, claimer, at)
    if (claimer === undefined || claimerGone) {
      await writePersisted($, p =>
        p.shutdownPlan?.id === plan.id && p.shutdownPlan.firedAt === undefined
          ? { ...p, shutdownPlan: { ...p.shutdownPlan, firedBy: self } }
          : p,
      )
      return
    }
    if (claimer !== self) return
  }
  const fired: ShutdownPlan = { ...plan, firedBy: self, firedAt: at }
  await writePersisted($, p => (p.shutdownPlan?.id === plan.id ? { ...p, shutdownPlan: fired } : p))
  await update($, shutdownPlan, () => fired)
  await update($, planNotedId, () => null)
  await update($, planRemindedId, () => null)
  await update($, planTold, () => null)
  await update($, planCancelPending, () => null)
  const lang = await currentLang($)
  // The option as it stands now decides what the computer does: changed since the plan, the person's latest word counts.
  const t = strings(lang, shutdownMode)
  const readiness = await shutdownReadinessNow($)
  if (!readiness.isReady) {
    $.ui.log(t.shutdownHelp(readiness))
    return
  }
  const phase = await read($, shutdownPhase)
  if (phase !== 'idle' && phase !== 'asking') return
  // The shutdown for all sessions, as the button's „as soon as possible“ makes it, without a question: nobody is there.
  await update($, shutdownPhase, () => 'requested')
  await update($, requestRole, () => 'own')
  await update($, listedSessions, () => [])
  await update($, questionsClosed, () => true)
  await writeRequest($, {
    id: `${self}-${at}`,
    kind: 'shutdown',
    by: self,
    byFolder: await currentFolder($),
    at,
    state: 'decided',
    decidedAt: at,
    decisions: {},
    countdownUntil: null,
    mode: shutdownMode,
    scheduledFor: plan.at,
  })
  const pause = await read($, pausePhase)
  if (pause === 'paused') {
    await beginShutdownWait($)
    return
  }
  // A pause under way ends in the wait (enterPaused).
  if (pause === 'pausing') return
  const isIdle = !(await isWorkingNow($)) && !(await read($, isAwaitingPerson))
  if (isIdle) {
    await enterPaused($)
    return
  }
  await enterPausing($, true)
  if ((await handToModel($, timedPauseRequest(clockOf(plan.at), lang, shutdownMode))) === 'appended') {
    await update($, pauseDelivered, () => false)
  }
}

function isAliveId(persisted: Persisted, id: string, at: number): boolean {
  const seen = persisted.liveSessions?.[id]
  return seen !== undefined && isAlive(seen, at)
}

// The tool Claude plans the shutdown with, now or at a time (schedule_shutdown).
async function registerScheduleTool($: EngineInterface): Promise<void> {
  if (scheduleToolRegistered) return
  try {
    await $.tool.register({
      name: SCHEDULE_TOOL_NAME,
      description: scheduleToolDescription(),
      inputSchema: {
        type: 'object',
        properties: {
          when: { type: 'string', enum: ['now', 'later'], description: 'now: as soon as possible; later: at a time or after a while.' },
          at: { type: 'string', description: 'For later: the time, "HH:MM" in 24 hours, the next time it comes.' },
          inMinutes: { type: 'number', description: 'For later, instead of at: in so many minutes.' },
        },
        required: ['when'],
      },
      isDeferred: false,
    })
    scheduleToolRegistered = true
  } catch {
    // The session is not bound yet: classic.SessionStart tries again.
  }
}

async function startShutdownCountdown($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  stopShutdownTimers()
  // A planned shutdown counts down a minute: nobody is there to cancel it (0.11.0).
  const span = (await read($, sessionRequest))?.scheduledFor !== undefined ? SCHEDULED_COUNTDOWN_MS : SHUTDOWN_COUNTDOWN_MS
  await update($, waitingSessions, () => [])
  await changeOwnRequest($, r => ({ ...r, state: 'countdown', countdownUntil: at + span }))
  await update($, shutdownAt, () => at + span)
  await update($, shutdownPhase, () => 'countdown')
  await update($, now, () => at)
  // The countdown in the band, second by second, and the command at its end.
  shutdownTicker = $.clock.every(1000, () => {
    void tick($)
  })
  shutdownTimer = $.clock.after(span, () => {
    void runShutdown($).catch(() => undefined)
  })
  void notifyCountdown($, span).catch(() => undefined)
}

// The last chance to cancel, for someone in another window: a notification through Claude Code's own channel, the
// one the person's `preferredNotifChannel` names (0.9.4). It reaches terminals that show notifications (iTerm2, kitty,
// Ghostty), elsewhere at most the bell; the desktop app draws no terminal and reports the pause itself. No program of
// the mod's own runs for it. The option `notifications` turns it off.
async function notifyCountdown($: EngineInterface, span: number): Promise<void> {
  if (!isNotifying) return
  const t = strings(await currentLang($), shutdownMode)
  const folder = await currentFolder($)
  await $.ui.notify(t.shutdownNotifyBody(folder), { title: t.shutdownNotifyTitle(span / 1000) })
}

function stopShutdownTimers(): void {
  shutdownTimer?.cancel()
  shutdownTimer = null
  shutdownTicker?.cancel()
  shutdownTicker = null
}

// The cancel button, and quietly whatever ends the pause: the pause itself stays as it is.
async function cancelShutdown($: EngineInterface, isQuiet: boolean): Promise<void> {
  stopShutdownTimers()
  if ((await read($, shutdownPhase)) === 'idle') return
  await update($, shutdownPhase, () => 'idle')
  await update($, shutdownAt, () => null)
  await update($, waitingSessions, () => [])
  // The other sessions keep their pauses; the shutdown is off for all of them.
  await changeOwnRequest($, r =>
    r.kind === 'shutdown' && (r.state === 'open' || r.state === 'decided' || r.state === 'countdown')
      ? { ...r, state: 'cancelled' }
      : null,
  )
  if (!isQuiet) $.ui.toast(strings(await currentLang($), shutdownMode).shutdownCancelled)
}

async function runShutdown($: EngineInterface): Promise<void> {
  stopShutdownTimers()
  if ((await read($, shutdownPhase)) !== 'countdown') return
  // Cancelled in another band since this session's last look: nothing runs (0.11.0).
  if (await isCancelAsked($)) {
    await cancelShutdown($, false)
    return
  }
  const readiness = await read($, shutdownReadiness)
  // Once more right before it runs: an answer for another mode (the option changed meanwhile) runs nothing.
  if (readiness === null || !readiness.isReady || !readinessFits(readiness, shutdownMode)) {
    await cancelShutdown($, true)
    if (readiness !== null && !readinessFits(readiness, shutdownMode)) {
      const t = strings(await currentLang($), shutdownMode)
      $.ui.toast(t.shutdownFailed(t.modeChanged))
    }
    void checkShutdown($).catch(() => undefined)
    return
  }
  const t = strings(await currentLang($), shutdownMode)
  await update($, shutdownPhase, () => 'shutting')
  const isComingBack = shutdownMode !== 'shutdown'
  if (!isComingBack) await changeOwnRequest($, r => ({ ...r, state: 'done' }))
  $.ui.log(t.shutdownLog)
  const startedAt = await $.clock.now()
  try {
    const program = readiness.command[0] ?? ''
    const folder = readiness.os === 'windows' ? program.slice(0, program.lastIndexOf('\\')) : '/'
    // Standby on Windows returns only once the computer is awake again: the call may take as long as allowed.
    const result = await $.process.run(readiness.command, { cwd: folder, timeoutMs: isComingBack ? 600_000 : 30_000 })
    if (result.exitCode !== 0) throw new Error(result.stderr.trim().split('\n')[0] || `exit code ${result.exitCode}`)
    if (isComingBack) await afterWaking($)
  } catch (error) {
    // A call that outlasted its time while the computer slept has done its work.
    if (isComingBack && (await $.clock.now()) - startedAt >= 20_000) {
      await afterWaking($)
      return
    }
    await update($, shutdownPhase, () => 'idle')
    await update($, shutdownAt, () => null)
    const message = t.shutdownFailed(error instanceof Error ? error.message : String(error))
    $.ui.toast(message)
    $.ui.log(message)
  }
}

// Back from standby or hibernation: the sessions stay paused until „Weiter“, and the request's countdown is over.
async function afterWaking($: EngineInterface): Promise<void> {
  await update($, shutdownPhase, () => 'idle')
  await update($, shutdownAt, () => null)
  await update($, waitingSessions, () => [])
  await changeOwnRequest($, r => (r.state === 'countdown' ? { ...r, state: 'cancelled' } : null))
}

// Claude's way to tell the band that it paused the session or picks the work back up (pause_state): a pause asked
// for in any words counts, not only the button and the few typed words. Listed in the prompt's tool list from the
// start, so Claude knows it before a pause is asked for.
async function registerPauseTool($: EngineInterface, askAbove: number): Promise<void> {
  if (pauseToolRegistered) return
  try {
    await $.tool.register({
      name: PAUSE_TOOL_NAME,
      description: pauseToolDescription(askAbove),
      inputSchema: {
        type: 'object',
        properties: { state: { type: 'string', enum: ['paused', 'running'] } },
        required: ['state'],
      },
      isDeferred: false,
    })
    pauseToolRegistered = true
  } catch {
    // The session is not bound yet: classic.SessionStart tries again.
  }
}

// ── Pause and shutdown across sessions (0.9.4) ────────────────────────────────────────────────────────────────────

// The session's working folder by its last part, to name it to the person in another session.
async function currentFolder($: EngineInterface): Promise<string | null> {
  try {
    return folderOf(await $.session.cwd())
  } catch {
    return null
  }
}

// Every session writes its sign of life into the state file, every HEARTBEAT_MS and at each change of its pause:
// what the others read to ask the person about it, and to know whether it has paused. Its own entry alone.
async function writeHeartbeat($: EngineInterface): Promise<void> {
  const self = await currentSessionId($)
  if (self === null) return
  const at = await $.clock.now()
  const entry: LiveSession = {
    seenAt: at,
    folder: await currentFolder($),
    phase: await read($, pausePhase),
    workingSince: await read($, workingSince),
    runs: await read($, backgroundRuns),
    isAwaitingPerson: await read($, isAwaitingPerson),
    requestId: (await read($, pausedByRequest)) ?? handledRequestId,
    ...(await overviewFields($)),
  }
  await writePersisted($, p => ({ ...p, liveSessions: { ...withoutForgotten(p.liveSessions, at), [self]: entry } }))
}

// What the sessions overview shows of a session (0.10.0): since when it is paused, its context against its threshold,
// when its cache lapses, keep-warm, its model.
async function overviewFields($: EngineInterface): Promise<Partial<LiveSession>> {
  const fill = await read($, context)
  const limit = await read($, threshold)
  const life = await read($, ttl)
  const used = (await read($, cacheUsedAt)) ?? (await read($, lastResponseAt))
  const gone = await read($, cacheGoneAt)
  return {
    pausedAt: (await read($, pausePhase)) === 'paused' ? await read($, pausedAt) : null,
    contextPercent: fill?.percent ?? null,
    thresholdPercent: limit === null || limit.isFallback ? null : limit.percent,
    cacheUntil: used === null || life === null ? null : gone !== null ? gone : used + life.minutes * 60_000,
    keepWarm: await read($, keepWarm),
    model: await read($, mainModel),
    permissionMode: await read($, permissionMode),
  }
}

// The overview's list from the signs of life: this session's first, then the others alive by folder.
async function refreshSessionsView($: EngineInterface): Promise<void> {
  const self = await currentSessionId($)
  const at = await $.clock.now()
  const live = (await readPersisted($)).liveSessions ?? {}
  const rows = Object.entries(live)
    .filter(([id, entry]) => id === self || isAlive(entry, at))
    .map(([id, entry]) => ({ id, isSelf: id === self, entry }))
    .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : (a.entry.folder ?? '').localeCompare(b.entry.folder ?? '')))
  await update($, sessionsView, () => rows)
}

async function forgetHeartbeat($: EngineInterface, id: string): Promise<void> {
  await writePersisted($, p => {
    if (p.liveSessions?.[id] === undefined) return p
    const live = { ...p.liveSessions }
    delete live[id]
    return { ...p, liveSessions: live }
  })
}

function startHeartbeat($: EngineInterface): void {
  if (heartbeatStarted) return
  heartbeatStarted = true
  void $.clock.now().then(at => {
    moduleStartedAt ??= at
  })
  $.clock.every(HEARTBEAT_MS, () => {
    void sessionsTick($).catch(() => undefined)
  })
}

async function sessionsTick($: EngineInterface): Promise<void> {
  await writeHeartbeat($)
  await lookAtPlanAndRequest($)
  await refreshSessionsView($)
}

async function lookAtPlanAndRequest($: EngineInterface): Promise<void> {
  if (isLooking) return
  isLooking = true
  try {
    await followPlan($)
    await followRequest($)
  } finally {
    isLooking = false
  }
}

// From PLAN_NEAR_MS before a plan's time until PLAN_FOLLOW_MS after it fired: a look every second, so the plan fires on
// the second, the others take it up at once and a cancel in any band counts within a second. Hours ahead the
// 15-second look is enough (the person's word).
function watchNearPlan($: EngineInterface): void {
  if (nearPlanWatch !== null) return
  nearPlanWatch = $.clock.every(1000, () => {
    void followNearPlan($).catch(() => undefined)
  })
}

async function followNearPlan($: EngineInterface): Promise<void> {
  await lookAtPlanAndRequest($)
  const plan = await read($, shutdownPlan)
  const at = await $.clock.now()
  const isNear =
    plan !== null &&
    (plan.firedAt === undefined ? plan.at - at <= PLAN_NEAR_MS : at - plan.firedAt <= PLAN_FOLLOW_MS)
  if (!isNear) {
    nearPlanWatch?.cancel()
    nearPlanWatch = null
  }
}

// The request for all sessions lives in a file of its own, which only the session that made it writes.
async function readRequest($: EngineInterface): Promise<SessionRequest | null> {
  const home = await homeDir($)
  if (home === null) return null
  try {
    if (!(await $.fs.exists(`${home}/.claude/cache-weather-and-pause-resume/request.json`))) return null
    const value: unknown = JSON.parse(await $.fs.read(`${home}/.claude/cache-weather-and-pause-resume/request.json`))
    return isSessionRequest(value) ? value : null
  } catch {
    return null
  }
}

async function writeRequest($: EngineInterface, request: SessionRequest): Promise<void> {
  await update($, sessionRequest, () => request)
  const home = await homeDir($)
  if (home === null) return
  try {
    await $.fs.write(`${home}/.claude/cache-weather-and-pause-resume/request.json`, `${JSON.stringify(request, null, 2)}\n`)
  } catch {
    // Not writable: the other sessions do not learn of it, this one goes on alone.
  }
}

// A change to this session's own request; null leaves it as it is.
async function changeOwnRequest($: EngineInterface, change: (r: SessionRequest) => SessionRequest | null): Promise<void> {
  if ((await read($, requestRole)) !== 'own') return
  const request = await read($, sessionRequest)
  if (request === null) return
  const next = change(request)
  if (next !== null) await writeRequest($, next)
}

// Before a pause or shutdown request goes to Claude: the other sessions alive with work running. A shutdown always
// makes a request for all sessions; a pause only where others are at work (the person decides whether they pause too).
// With sessions at work, Claude asks the person first (`open`), else the request stands at once.
async function prepareRequest(
  $: EngineInterface,
  kind: 'pause' | 'shutdown',
): Promise<{ busy: [string, LiveSession][]; note: string | null; at: number }> {
  const at = await $.clock.now()
  try {
    const self = await currentSessionId($)
    if (self === null) return { busy: [], note: null, at }
    const busy = liveOthers((await readPersisted($)).liveSessions, self, at).filter(([, s]) => isBusy(s))
    if (kind === 'pause' && busy.length === 0) return { busy, note: null, at }
    const isOpen = busy.length > 0
    await update($, requestRole, () => 'own')
    await update($, listedSessions, () => busy.map(([id]) => id))
    await update($, questionsClosed, () => false)
    await writeRequest($, {
      id: `${self}-${at}`,
      kind,
      by: self,
      byFolder: await currentFolder($),
      at,
      state: isOpen ? 'open' : 'decided',
      decidedAt: isOpen ? null : at,
      decisions: {},
      countdownUntil: null,
      ...(kind === 'shutdown' ? { mode: shutdownMode } : {}),
    })
    return { busy, note: isOpen ? othersNote(kind, busy, at, await currentLang($), shutdownMode) : null, at }
  } catch {
    return { busy: [], note: null, at }
  }
}

// What the request holds once the person answered, or, should Claude not have passed the answer on, by default: the
// listed sessions' runs are waited for.
function decided(r: SessionRequest, listed: readonly string[], at: number, answer: Record<string, RunsDecision> = {}): SessionRequest {
  return { ...r, state: 'decided', decidedAt: at, decisions: Object.fromEntries(listed.map(id => [id, answer[id] ?? 'wait'])) }
}

// This session is paused and the shutdown asked for: it waits for the other sessions, then counts down.
async function beginShutdownWait($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  const listed = await read($, listedSessions)
  await changeOwnRequest($, r => (r.state === 'open' ? decided(r, listed, at) : null))
  await update($, shutdownPhase, () => 'waiting')
  await evaluateShutdownWait($)
}

async function evaluateShutdownWait($: EngineInterface): Promise<void> {
  if ((await read($, shutdownPhase)) !== 'waiting') return
  const request = await read($, sessionRequest)
  const self = await currentSessionId($)
  const at = await $.clock.now()
  const pending =
    request === null || (await read($, requestRole)) !== 'own'
      ? []
      : waitingFor(request, (await readPersisted($)).liveSessions, self, at)
  // One held up by a question or an approval nobody answers says so (0.10.2): it waits until someone does.
  const t = strings(await currentLang($), shutdownMode)
  await update($, waitingSessions, () =>
    pending.map(([id, s]) => `${s.folder ?? shortId(id)}${s.isAwaitingPerson ? ` ${t.waitsForYou}` : ''}`),
  )
  if (pending.length === 0) await startShutdownCountdown($)
}

// Sessions at work that the shutdown cannot pause: a transcript written within RECENT_TRANSCRIPT_MS whose session
// writes no sign of life. Only the files' names and times are read.
async function countWithoutMod($: EngineInterface, live: Persisted['liveSessions'], self: string, at: number): Promise<number> {
  const home = await homeDir($)
  if (home === null) return 0
  const known = new Set(Object.entries(live ?? {}).filter(([, s]) => isAlive(s, at)).map(([id]) => id))
  known.add(self)
  const recent = new Set<string>()
  try {
    for (const dir of (await $.fs.list(`${home}/.claude/projects`)).filter(entry => entry.kind === 'dir')) {
      for (const entry of await $.fs.list(`${home}/.claude/projects/${dir.name}`)) {
        if (entry.kind !== 'file' || !entry.name.endsWith('.jsonl') || at - entry.mtimeMs > RECENT_TRANSCRIPT_MS) continue
        const id = entry.name.slice(0, -'.jsonl'.length)
        if (!known.has(id)) recent.add(id)
      }
    }
  } catch {
    return 0
  }
  return recent.size
}

// Every HEARTBEAT_MS: this session's own request (whom the shutdown waits for), or another session's, which this one
// takes up once: idle, it counts as paused at once and shows „Weiter“; at work, Claude gets the pause without a
// question to ask, its runs ended or waited for as the person answered. When the request is picked back up there,
// the sessions it paused pick up too.
async function followRequest($: EngineInterface): Promise<void> {
  const self = await currentSessionId($)
  if (self === null) return
  const at = await $.clock.now()
  if ((await read($, requestRole)) === 'own') {
    if (await isCancelAsked($)) {
      await cancelShutdown($, false)
      return
    }
    const own = await read($, sessionRequest)
    if (own !== null && (own.state === 'decided' || own.state === 'countdown')) {
      const count = await countWithoutMod($, (await readPersisted($)).liveSessions, self, at)
      await update($, sessionsWithoutMod, () => count)
    }
    await evaluateShutdownWait($)
    return
  }
  const request = await readRequest($)
  if (request === null) return
  if (request.by === self) {
    // Its own request, which the session forgot over a restart of the app: „Weiter“ there still picks the others up.
    if (request.state === 'open' || request.state === 'decided' || request.state === 'countdown' || request.state === 'cancelled') {
      await update($, sessionRequest, () => request)
      await update($, requestRole, () => 'own')
    }
    return
  }
  const pausedBy = await read($, pausedByRequest)
  if (request.id === handledRequestId || request.id === pausedBy) {
    await update($, sessionRequest, () => request)
    watchForeignShutdown($, request)
    if (request.state === 'resumed' && pausedBy === request.id && (await read($, pausePhase)) !== 'running') {
      if (await read($, isIdlePause)) await enterRunning($)
      else await requestResume($)
    }
    return
  }
  if (!asksToPause(request, self, at, moduleStartedAt ?? at)) return
  handledRequestId = request.id
  await update($, sessionRequest, () => request)
  await update($, requestRole, () => 'foreign')
  watchForeignShutdown($, request)
  await update($, questionsClosed, () => true)
  if ((await read($, pausePhase)) === 'running') {
    await update($, pausedByRequest, () => request.id)
    const isIdle =
      !(await read($, turnRunning)) && (await read($, backgroundRuns)).length === 0 && !(await read($, isAwaitingPerson))
    if (isIdle) {
      await update($, isIdlePause, () => true)
      await enterPaused($)
    } else {
      const lang = await currentLang($)
      await enterPausing($, true)
      const text = foreignPauseRequest(request.kind, request.byFolder, request.decisions[self] ?? 'wait', lang, request.mode)
      if ((await handToModel($, text)) === 'appended') await update($, pauseDelivered, () => false)
    }
  }
  await writeHeartbeat($)
}

// Another session's shutdown under way: this band reads its state every second, so it counts down by itself, second by
// second, and a cancel or the end shows within a second; the 15-second look only finds it (0.11.0, the person's ask).
function watchForeignShutdown($: EngineInterface, request: SessionRequest): void {
  if (foreignWatch !== null || request.kind !== 'shutdown' || !isUnderWay(request)) return
  foreignWatch = $.clock.every(1000, () => {
    void followForeignShutdown($).catch(() => undefined)
  })
}

function stopForeignWatch(): void {
  foreignWatch?.cancel()
  foreignWatch = null
}

async function followForeignShutdown($: EngineInterface): Promise<void> {
  const known = await read($, sessionRequest)
  const request = await readRequest($)
  const at = await $.clock.now()
  await update($, now, () => at)
  if (known === null || request === null || request.id !== known.id || (await read($, requestRole)) !== 'foreign') {
    stopForeignWatch()
    return
  }
  if (JSON.stringify(known) !== JSON.stringify(request)) await update($, sessionRequest, () => request)
  if (!isUnderWay(request)) stopForeignWatch()
}

// The tool Claude passes the person's answer about the other sessions with (pause_sessions).
async function registerSessionsTool($: EngineInterface): Promise<void> {
  if (sessionsToolRegistered) return
  try {
    await $.tool.register({
      name: SESSIONS_TOOL_NAME,
      description: sessionsToolDescription(),
      inputSchema: {
        type: 'object',
        properties: {
          pauseOthers: { type: 'boolean', description: 'For a pause: whether the other sessions pause too. A shutdown always takes them.' },
          sessions: {
            type: 'array',
            description: 'For each listed session: its short id as listed, and whether its running work ends now or is waited for.',
            items: {
              type: 'object',
              properties: { session: { type: 'string' }, action: { type: 'string', enum: ['end', 'wait'] } },
              required: ['session', 'action'],
            },
          },
        },
        required: ['sessions'],
      },
      isDeferred: false,
    })
    sessionsToolRegistered = true
  } catch {
    // The session is not bound yet: classic.SessionStart tries again.
  }
}

// ── The pause button ──────────────────────────────────────────────────────────────────────────────────────────────

async function rememberPause($: EngineInterface, at: number | null): Promise<void> {
  const id = await currentSessionId($)
  if (id === null) return
  if (at === null && (await readPersisted($)).pausedSessions?.[id] === undefined) return
  await writePersisted($, p => ({ ...p, pausedSessions: withSession(p.pausedSessions, id, at) }))
}

// A session reopened while paused (the app restarted, the session resumed) shows „Weiter“ again.
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
  void writeHeartbeat($).catch(() => undefined)
}

async function enterPaused($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, pausedAt, () => at)
  await update($, pauseTasksLeft, () => null)
  await update($, now, () => at)
  await setPausePhase($, 'paused')
  await rememberPause($, at)
  void writeHeartbeat($).catch(() => undefined)
  if ((await read($, shutdownPhase)) === 'requested') await beginShutdownWait($)
}

async function enterRunning($: EngineInterface): Promise<void> {
  await setPausePhase($, 'running')
  await update($, pauseRequestedAt, () => null)
  await update($, pausedAt, () => null)
  await update($, pauseTasksLeft, () => null)
  await update($, pauseDelivered, () => true)
  await rememberPause($, null)
  await cancelShutdown($, true)
  // A request of this session's is over: the sessions it paused pick their work back up as well.
  await changeOwnRequest($, r =>
    r.state === 'withdrawn' || r.state === 'done' || r.state === 'resumed' ? null : { ...r, state: 'resumed' },
  )
  await update($, questionsClosed, () => false)
  await update($, pausedByRequest, () => null)
  await update($, isIdlePause, () => false)
  await update($, sessionRequest, () => null)
  await update($, requestRole, () => null)
  await update($, listedSessions, () => [])
  await update($, sessionsWithoutMod, () => 0)
  void writeHeartbeat($).catch(() => undefined)
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
  const t = strings(await currentLang($), shutdownMode)
  $.prompt.submit({ text, asUser: true }).catch(error => {
    $.ui.toast(t.sendFailed(String(error)))
  })
  return 'submitted'
}

async function requestPause($: EngineInterface, askAbove: number, kind: 'pause' | 'shutdown' = 'pause'): Promise<void> {
  if ((await read($, pausePhase)) !== 'running') return
  const lang = await currentLang($)
  const others = await prepareRequest($, kind)
  await enterPausing($, true)
  const parts = [pauseRequest(askAbove, lang)]
  if (kind === 'shutdown') parts.push(shutdownNote(lang, shutdownMode))
  if (others.note !== null) parts.push(others.note)
  const request = parts.join('\n\n')
  // An appended row waits for the turn's next request; should the turn end first, the Stop hook hands it on.
  // (Marked after the append: a request racing it at worst hands the model the request twice.)
  if ((await handToModel($, request)) === 'appended') await update($, pauseDelivered, () => false)
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
    $.ui.toast(strings(lang, shutdownMode).resumeSendFailed(String(error)))
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
  keepWarmByDefault = options.keepWarm !== 'off'
  keepWarmHours = keepWarmHoursOf(options.keepWarmHours)
  isNotifying = options.notifications !== 'off'
  shutdownMode = modeOf(options.shutdownMode)
  shutdownCheck = null
  stopShutdownTimers()
  pauseToolRegistered = false
  keepWarmStarted = false
  tickerStarted = false
  heartbeatStarted = false
  sessionsToolRegistered = false
  scheduleToolRegistered = false
  foreignWatch = null
  nearPlanWatch = null
  isLooking = false
  handledRequestId = null
  moduleStartedAt = null
  isRefreshing = false
  usageStopSaid = null
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
      await restoreKeepWarm($, id)
    } else {
      await update($, keepWarm, () => keepWarmByDefault)
    }
    void checkShutdown($).catch(() => undefined)

    await refreshContext($)
    await refreshThreshold($)
    await tick($)
    await detectFromTranscript($)

    startTicker($)
    startKeepWarm($)
    startHeartbeat($)
    await registerPauseTool($, askAbove)
    await registerSessionsTool($)
    await registerScheduleTool($)
    return started
  })

  // The four hooks below only observe: should their own work fail, `.catch` hands on what `next` settled to (or runs
  // it, where it was not called yet), so nothing is refused and nothing runs twice.
  on('classic.SessionStart', async ($, e, next) => {
    await update($, transcriptPath, () => e.transcript_path)
    await notePermissionMode($, e.permission_mode)
    // A resumed session carries its id here even where `$.session.id()` was not bound yet at session.start; after
    // /clear the id is a new one, whose pause (none) is restored.
    await update($, sessionId, () => e.session_id)
    await restorePause($, e.session_id)
    await restoreKeepWarm($, e.session_id)
    void checkShutdown($).catch(() => undefined)
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
    startTicker($)
    startKeepWarm($)
    startHeartbeat($)
    await registerPauseTool($, askAbove)
    await registerSessionsTool($)
    await registerScheduleTool($)
    // Once per session start, a little later: what is remembered of deleted sessions goes.
    $.clock.after(PRUNE_AFTER_MS, () => {
      void pruneSessions($).catch(() => undefined)
    })
    return next(e)
  }).catch(($, e, next) => next(e))

  // Each response of the main conversation: the cache was read or written now, and its hit rate. A request that
  // starts after the pause row was appended carries it.
  on('turn.step', async function* ($, e, next) {
    let sentAt: number | null = null
    if (e.agentId === undefined) {
      try {
        if ((await read($, pausePhase)) === 'pausing' && !(await read($, pauseDelivered))) {
          await update($, pauseDelivered, () => true)
        }
        // A request of the conversation's own reads the cache as it goes out. Should a refresh of an idle session come
        // by here, no turn runs: it is not counted.
        if (!isRefreshing || (await read($, turnRunning))) sentAt = await $.clock.now()
      } catch {
        // Never hold up a request over the band's bookkeeping.
      }
    }
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage) {
      const at = await $.clock.now()
      const rate = hitRate(result.usage)
      try {
        await update($, mainModel, () => e.model)
        if (sentAt !== null) await drawBalance($, result.usage)
        if (sentAt !== null) await drawMissedSaving($, result.usage, sentAt)
      } catch {
        // The balance waits; the readings below must not.
      }
      await update($, lastResponseAt, () => at)
      await update($, lastHitRate, () => rate)
      await update($, now, () => at)
      // The response wrote the conversation's cache anew, after a compaction or a switch of model too.
      await update($, cacheGoneAt, () => null)
      // Answered: the idle span starts over from the request, and Claude waits for no one. A request that failed read
      // nothing and counts for nothing.
      if (sentAt !== null) await markActive($, sentAt, true)
      await update($, isAwaitingPerson, () => false)
      await update($, isAwaitingApproval, () => false)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('rateLimits')) await update($, usageWindows, () => usageOf(e.rateLimits))
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
    await notePermissionMode($, e.permission_mode)
    try {
      await update($, transcriptPath, () => e.transcript_path)
      await detectFromTranscript($)
      if ((await read($, threshold))?.isFallback !== false) await refreshThreshold($)
    } catch {
      // The readings wait for the next stop; the pause below must not.
    }
    try {
      await update($, backgroundRuns, () => runsInFlight(e.background_tasks))
    } catch {
      // The other sessions read the runs at the next stop.
    }
    return pauseOnStop($, e.background_tasks, result, askAbove)
  }).catch(($, e, next) => next(e))

  // Since Claude Code 2.1.299 turn.start also comes for subagents' turns (with `agentId`): only the main loop's counts.
  on('turn.start', async ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) {
      await update($, turnRunning, () => true)
      const at = await $.clock.now()
      await update($, workingSince, prev => prev ?? at)
      await deliverCancel($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      await update($, turnRunning, () => false)
      await update($, isAwaitingPerson, () => false)
      await update($, isAwaitingApproval, () => false)
      await update($, workingSince, () => null)
      // The forecast's reading (0.10.0): how many tokens this turn added to the context.
      const tokens = (await read($, context))?.tokens ?? null
      if (tokens !== null) {
        const last = await read($, lastTurnTokens)
        if (last !== null) await update($, turnGrowths, growths => withGrowth(growths, tokens - last))
        await update($, lastTurnTokens, () => tokens)
      }
    }
    return result
  }).catch(($, e, next) => next(e))

  // Claude Code's notice that a permission prompt (or an MCP server's form) waits for the person, about six seconds
  // after it appeared: Claude waits until the call has run (or was refused). A notification decides nothing.
  on('classic.Notification', async ($, e, next) => {
    const result = await next(e)
    await notePermissionMode($, e.permission_mode)
    if (WAITING_NOTICES.has(e.notification_type)) {
      await update($, isAwaitingPerson, () => true)
      await update($, isAwaitingApproval, () => true)
    }
    return result
  }).catch(($, e, next) => next(e))

  // Claude reports through the mod's own tool that it has paused the session, or picks the paused work back up. The
  // call is answered here: nothing else runs, and the band and the state file are all it changes.
  on('tool.call', { tool: 'mcp__cache-weather-and-pause-resume__pause_state' }, async ($, e) => {
    if (e.agentId !== undefined) return { result: 'Only the main conversation reports the pause; nothing changed.' }
    const state = (e as { state?: unknown }).state
    if (state === 'paused') {
      if ((await read($, pausePhase)) !== 'paused') await enterPaused($)
      return { result: 'The band shows the session as paused. Report "Paused" briefly and wait.' }
    }
    if (state === 'running') {
      if ((await read($, pausePhase)) !== 'running') await enterRunning($)
      return { result: 'The band shows the session as running again.' }
    }
    return { result: 'Nothing changed: state must be "paused" or "running".' }
  })

  // Claude passes on the person's answer about the other sessions: the request stands, and the others pause now.
  // The permission mode (0.11.0), as each prompt of the person starts a turn (the mode they set for it) and after each
  // call of the main conversation (a turn may run for hours, and the mode may be switched within it). classic.PreToolUse
  // carries only the call, no mode. Only reads; whatever happens, the prompt and the call go on as they would.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    if (e.agent_id === undefined) await notePermissionMode($, e.permission_mode)
    return result
  }).catch(($, e, next) => next(e))
  on('classic.PostToolUse', async ($, e, next) => {
    const result = await next(e)
    if (e.agent_id === undefined) await notePermissionMode($, e.permission_mode)
    return result
  }).catch(($, e, next) => next(e))

  // Claude plans the shutdown, now or at a time (0.11.0): the button's question answered, or the person's words.
  on('tool.call', { tool: SCHEDULE_TOOL }, async ($, e) => {
    if (e.agentId !== undefined) return { result: 'Only the main conversation plans the shutdown; nothing changed.' }
    return { result: await scheduleShutdown($, e as { when?: unknown; at?: unknown; inMinutes?: unknown }, askAbove) }
  })

  // Claude's own shutdown, standby or hibernation goes through the band (0.11.0): a shell command for it is turned away
  // with the tool to use, so the sessions pause first and the mod runs the command itself. In any loop; every other
  // command runs as it would without the hook, and should the check fail, the command runs.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const command = (e as { command?: unknown }).command
    if (typeof command === 'string' && isPowerCommand(command)) return { deny: powerRefusal(await currentLang($)) }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__cache-weather-and-pause-resume__pause_sessions' }, async ($, e) => {
    if (e.agentId !== undefined) return { result: 'Only the main conversation answers this; nothing changed.' }
    const request = await read($, sessionRequest)
    if ((await read($, requestRole)) !== 'own' || request === null || request.state !== 'open') {
      return { result: 'No question about other sessions is open; nothing changed.' }
    }
    const listed = await read($, listedSessions)
    const { pauseOthers, decisions } = readDecisions(e, listed)
    const at = await $.clock.now()
    const takesOthers = request.kind === 'shutdown' || pauseOthers
    await writeRequest($, takesOthers ? decided(request, listed, at, decisions) : { ...request, state: 'withdrawn', decidedAt: at })
    await update($, questionsClosed, () => true)
    if ((await read($, pausePhase)) === 'paused' && (await read($, shutdownPhase)) === 'requested') await beginShutdownWait($)
    return {
      result: takesOthers
        ? `Recorded: the other sessions pause now${request.kind === 'shutdown' ? ', and the shutdown waits for the runs the person chose to wait for' : ''}. Ask nothing more until the pause is over.`
        : 'Recorded: the pause stays with this session. Ask nothing more until the pause is over.',
    }
  })

  // A question to the person waits for the answer; the answer is input of the person's and starts the idle span over.
  // Any call of the main conversation that has run ends a wait for a permission prompt. Observes only: the call runs
  // as it would without the hook.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const isQuestion = e.tool === 'AskUserQuestion'
    // Once the pause's question is asked, or another session paused this one, a dialog waits for the resume.
    if (isQuestion && (await read($, questionsClosed))) return { deny: questionRefusal(await currentLang($)) }
    // From the plan on, a question waits for afterwards in every session (0.11.0, the person's rule).
    const planned = isQuestion ? await livePlan($) : null
    if (planned !== null) {
      const lang = await currentLang($)
      return { deny: planQuestionRefusal(clockOf(planned.at), lang, planned.mode) }
    }
    if (isQuestion) await update($, isAwaitingPerson, () => true)
    const result = await next(e)
    try {
      await update($, isAwaitingPerson, () => false)
      await update($, isAwaitingApproval, () => false)
      if (isQuestion) await markActive($, await $.clock.now(), false)
    } catch {
      // The call has run; the bookkeeping waits for the next response.
    }
    return result
  }).catch(($, e, next) => next(e))

  // From the press of Pause or Shutdown on, a call that would ask the person for approval waits for the resume (0.10.2,
  // the person's rule; a subagent's too since 0.11.0, so its prompt keeps no turn from ending while nobody is there): the pause request already tells Claude so, and a call that asks
  // anyway is turned away; Claude notes it in the pause state and repeats it after "continue". Only an ask the person
  // would answer is turned away: the engine's verdict stands for everything else, and the mod's own tools and questions
  // to the person go their own ways. An approval already on screen stays: a mod cannot take it back, and the status
  // row asks the person to answer it.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'ask' || e.approver !== 'person' || e.tool_use_id === undefined) {
      return verdict
    }
    if (e.tool === 'AskUserQuestion' || e.tool.startsWith('mcp__cache-weather-and-pause-resume__')) return verdict
    // Early only where the mode surely asks (0.11.0): elsewhere Claude Code's own check may settle it without anyone,
    // and a prompt that still comes up is turned away below.
    if (!(await surelyAsks($))) return verdict
    const reason = await heldApproval($)
    return reason === null ? verdict : { decision: 'deny', reason }
  }).catch(($, e, next) => next(e))

  // A permission prompt about to come up, in any mode (0.11.0): during a pause and before a planned shutdown it is
  // turned away with what to do instead, so no prompt waits for someone who is not there, a subagent's included: the
  // subagent notes the step and can end its run. It never allows anything.
  // Decided before the chain beneath: in the desktop app the dialog shows while the hooks run, and the chain beneath
  // answered only once the person had (seen live), so a deny after it came too late. A held approval is turned away
  // at once (the dialog flashes for an instant); anything else goes on untouched.
  on('classic.PermissionRequest', async ($, e, next) => {
    const tool = (e as { tool_name?: unknown }).tool_name
    const isOwn = tool === 'AskUserQuestion' || (typeof tool === 'string' && tool.startsWith('mcp__cache-weather-and-pause-resume__'))
    const reason = isOwn ? null : await heldApproval($)
    if (reason !== null) return { decision: { behavior: 'deny', message: reason } }
    return next(e)
  }).catch(($, e, next) => next(e))

  // After /clear the conversation the pause belonged to is gone. An ended session leaves no sign of life behind.
  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear') {
      await enterRunning($)
      // A new conversation grows its own way: the forecast starts over.
      await update($, turnGrowths, () => [])
      await update($, lastTurnTokens, () => null)
    }
    try {
      await forgetHeartbeat($, e.sessionId)
    } catch {
      // Left behind, it is ignored once older than a minute and a half, and forgotten after an hour.
    }
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
      const others = await prepareRequest($, 'pause')
      await enterPausing($, true)
      return withNote(others.note === null ? pauseRequest(askAbove, lang) : `${pauseRequest(askAbove, lang)}\n\n${others.note}`)
    }
    if (current === 'paused') return withNote(isPerson ? pausedPersonNote(lang) : pausedMachineNote(lang))
    // A shutdown planned (0.11.0): every prompt of the person's carries what it means for the work.
    const planned = current === 'running' && isPerson ? await livePlan($) : null
    if (planned !== null) {
      await told($, planned)
      return withNote(plannedNote(clockOf(planned.at), planned.byFolder, lang, planned.mode))
    }
    const cancelled = current === 'running' && isPerson ? await read($, planCancelPending) : null
    if (cancelled !== null) {
      await update($, planCancelPending, () => null)
      return withNote(planCancelledNote(lang, cancelled))
    }
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
    await notePermissionMode($, e.permission_mode)
    // Another model has no cache of this conversation: the next request writes it, a refresh would only pay for it.
    // The band shows the cache expired from here on (0.10.3).
    if (e.from_model !== e.to_model) {
      await update($, keepWarmNote, () => 'switched')
      const at = await $.clock.now()
      await update($, cacheGoneAt, () => at)
      await update($, mainModel, () => e.to_model)
      // What the switch costs where the cache was still warm (0.10.0): the tokens the next request writes again, and
      // Claude Code's own estimate of it. With a cache gone cold the rebuild was due anyway.
      if (e.prompt_cache_warm && e.context_tokens > 0) {
        const lang = await currentLang($)
        $.ui.log(
          strings(lang, shutdownMode).modelSwitchLog(
            e.to_model,
            groupDigits(e.context_tokens, lang),
            e.estimated_cache_write_usd,
            e.pricing,
          ),
        )
      }
    }
    await settleTtl($, { minutes: e.cache_ttl === '5m' ? 5 : 60, source: 'model-switch' })
    await refreshThreshold($)
    return result
  }).catch(($, e, next) => next(e))

  // After /compact or the button: the summary Claude goes on with, as log lines the model does not read.
  on('session.compact', async ($, e, next) => {
    const before = (await read($, context))?.tokens ?? undefined
    const result = await next(e)
    if (result.skip !== undefined) return result
    // The conversation is a new one now: the next request writes its cache, a refresh would read the old one, and the
    // band shows the cache expired from here on (0.10.3). (A precompute installs nothing yet, and a subagent's
    // compaction is its own.)
    if (e.agentId === undefined && e.trigger !== 'precompute') {
      await update($, keepWarmNote, () => 'compacted')
      const at = await $.clock.now()
      await update($, cacheGoneAt, () => at)
    }
    if (e.trigger !== 'manual' && e.trigger !== 'plugin') return result

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
    const t = strings(lang, shutdownMode)

    // After a compaction or a switch of model the cache is gone, whatever time the old one had left (0.10.3).
    const lifeShare = remainingShare(last, life?.minutes ?? null, at)
    const share = lifeShare !== null && (await read($, cacheGoneAt)) !== null ? 0 : lifeShare
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
          : (isTerminal ? t.cacheMinutes : t.cacheLeft)(remainingMinutes(last, life.minutes, at))
    const tone = share === null ? 'subtle' : cacheTone(share)
    // An expired cache leaves its readings stale: hits, context and threshold go until the next response.
    const isExpired = share !== null && share <= 0

    // Keep-warm's checkbox: the person's choice alone, the mod never switches it. Narrow signs in a terminal; in the
    // desktop app ☐ / ☑ (emoji were bigger but looked out of place, 2026-10-15). Why keep-warm waits for the next
    // request, when it does, goes into the status row.
    const isKeptWarm = await read($, keepWarm)
    const note = await read($, keepWarmNote)
    const refreshes = await read($, keepWarmRefreshes)
    const box = isTerminal ? (isKeptWarm ? '[✓]' : '[ ]') : isKeptWarm ? '☑' : '☐'
    const noteText =
      !isKeptWarm || note === null || life === null
        ? null
        : note === 'ended'
          ? t.keepWarmEnded(keepWarmSpanText(life.minutes, keepWarmHours))
          : note === 'compacted'
            ? t.keepWarmCompacted
            : note === 'switched'
              ? t.keepWarmSwitched
              : note === 'cold'
                ? t.keepWarmCold
            : note === 'limit'
              ? t.keepWarmLimit(Math.round(usageStopping(await read($, usageWindows))?.percentUsed ?? 90))
              : t.keepWarmMissed
    // Spelled out in the desktop app („☑ Cache warm halten (2× aufgefrischt)“), short in a terminal („[✓] Keep-warm ↻2“).
    const refreshCount = !isKeptWarm || refreshes <= 0 ? '' : isTerminal ? ` ↻${refreshes}` : ` ${t.keepWarmRefreshes(refreshes)}`
    const keepWarmLabel = `${box} ${isTerminal ? t.keepWarm : t.keepWarmSwitch}${refreshCount}`
    const onKeepWarm = async () => setKeepWarm($, !(await read($, keepWarm)))
    const keepWarmControl = <Button key="keep-warm" label={keepWarmLabel} plain onPress={onKeepWarm} />

    // The pause button: „Pause“, then „Weiter“ while Claude prepares the pause (it calls the pause off) and once it is
    // paused. Beside it the shutdown button, which pauses the same way and then shuts the computer down: dimmed where
    // that cannot happen unattended (a press says what is missing); while the shutdown is prepared or counted down,
    // its cancel button stands there instead. What the pause and the shutdown are at goes into the status row.
    const phase = await read($, pausePhase)
    const shutting = await read($, shutdownPhase)
    const readiness = await read($, shutdownReadiness)
    // In the desktop app each button is its one-colour icon with its word (0.10.0). Tried and dropped (2026-11-09): a
    // word revealed on hover pushed the buttons away from it; a word beside the button, outside it, looked poor; a
    // smaller Text inside it is drawn at the native button's own font. The terminal keeps the words.
    type IconButtonSpec = {
      key: string
      words: string
      icon: string
      onPress: () => unknown
      variant?: 'primary' | 'secondary'
      dimColor?: boolean
    }
    const iconButton = (spec: IconButtonSpec) => {
      const press = () => {
        void spec.onPress()
      }
      const look = {
        ...(spec.variant === undefined ? {} : { variant: spec.variant }),
        ...(spec.dimColor === undefined ? {} : { dimColor: spec.dimColor }),
      }
      if (isTerminal) return <Button key={spec.key} label={spec.words} onPress={press} {...look} />
      return <Button key={spec.key} label={`${spec.icon} ${spec.words}`} onPress={press} {...look} />
    }
    const isShutdownReady = readiness?.isReady === true && readinessFits(readiness, shutdownMode)
    // Another session's shutdown under way, not yet asked to cancel here: this band cancels it too (0.11.0).
    const otherRequest = (await read($, requestRole)) === 'foreign' ? await read($, sessionRequest) : null
    const otherShutdown =
      otherRequest !== null && otherRequest.kind === 'shutdown' && isUnderWay(otherRequest) &&
      (await read($, shutdownCancelAsked)) !== otherRequest.id
        ? otherRequest
        : null
    const onCancelShutdown = () => cancelShutdown($, false)
    const onShutdown = () => requestShutdown($)
    const onPause = () => requestPause($, askAbove)
    const onResume = () => requestResume($)
    const cancelShutdownButton = iconButton({
      key: 'shutdown-cancel',
      words: t.shutdownCancel,
      icon: BUTTON_ICONS.cancel,
      onPress: onCancelShutdown,
    })
    // While Claude asks when, or a shutdown is planned (0.11.0), the shutdown button's place holds its cancel button.
    const plan = await livePlan($)
    const planCancelButton = iconButton({
      key: 'plan-cancel',
      words: t.shutdownCancel,
      icon: BUTTON_ICONS.cancel,
      onPress: () => cancelPlan($),
    })
    const otherCancelButton = iconButton({
      key: 'shutdown-cancel',
      words: t.shutdownCancel,
      icon: BUTTON_ICONS.cancel,
      onPress: () => cancelShutdownAnywhere($),
    })
    const shutdownButton =
      otherShutdown !== null
        ? otherCancelButton
        : plan !== null
        ? planCancelButton
        : shutting === 'asking'
          ? cancelShutdownButton
          : iconButton({
              key: 'shutdown',
              words: t.shutdown,
              icon: BUTTON_ICONS[shutdownMode],
              onPress: onShutdown,
              dimColor: !isShutdownReady,
            })
    let pause = null
    if (
      shutting === 'countdown' ||
      shutting === 'waiting' ||
      (shutting === 'requested' && (phase === 'pausing' || phase === 'paused'))
    ) {
      pause = cancelShutdownButton
    } else if (shutting === 'shutting') {
      pause = null
    } else if (phase === 'running') {
      pause = (
        <Box flexDirection="row" gap={1}>
          {iconButton({ key: 'pause', words: t.pause, icon: BUTTON_ICONS.pause, onPress: onPause })}
          {shutdownButton}
        </Box>
      )
    } else if (phase === 'pausing') {
      const resumeButton = iconButton({ key: 'pause-cancel', words: t.resume, icon: BUTTON_ICONS.resume, onPress: onResume })
      pause =
        otherShutdown === null ? resumeButton : (
          <Box flexDirection="row" gap={1}>
            {resumeButton}
            {otherCancelButton}
          </Box>
        )
    } else {
      pause = (
        <Box flexDirection="row" gap={1}>
          {iconButton({ key: 'resume', words: t.resume, icon: BUTTON_ICONS.resume, onPress: onResume, variant: 'primary' })}
          {shutdownButton}
        </Box>
      )
    }

    // The status rows under the bar, one per message and only while there is one (0.9.3): what lasts stands here
    // rather than among the readings and the buttons, the most pressing first. The shutdown's countdown hides how
    // long the session has been paused, which it then is anyway.
    type StatusLine = { key: string; text: string; color?: 'error' | 'warning' | 'subtle' }
    const status: StatusLine[] = []
    // A pause another session asked for says where it came from (0.9.4).
    const role = await read($, requestRole)
    const request = await read($, sessionRequest)
    const from = role === 'foreign' && request !== null ? ` · ${t.fromSession(request.byFolder)}` : ''
    // Another session's request speaks of what it does there (shut down, standby, hibernation).
    const tr = role === 'foreign' && request !== null ? strings(lang, request.mode ?? 'shutdown') : t
    if (shutting === 'countdown') {
      const until = (await read($, shutdownAt)) ?? at
      status.push({ key: 'shutdown', text: t.shutdownIn(secondsLeft(until, at)), color: 'error' })
    } else if (shutting === 'shutting') {
      status.push({ key: 'shutdown', text: t.shutdownRunning, color: 'error' })
    } else if (shutting === 'waiting') {
      status.push({ key: 'shutdown', text: t.waitingFor(await read($, waitingSessions)), color: 'warning' })
    } else if (shutting === 'requested' && phase === 'paused') {
      status.push({ key: 'shutdown', text: t.shutdownRequested, color: 'warning' })
    } else if (
      role === 'foreign' && request?.state === 'countdown' && request.countdownUntil !== null &&
      (await read($, shutdownCancelAsked)) !== request.id
    ) {
      status.push({ key: 'shutdown', text: `${tr.shutdownIn(secondsLeft(request.countdownUntil, at))}${from}`, color: 'error' })
    } else if (shutting === 'asking') {
      status.push({ key: 'shutdown', text: t.shutdownAsking, color: 'warning' })
    } else if (plan !== null) {
      // A plan of another session's says where it came from (0.11.0).
      const self = await read($, sessionId)
      const planFrom = self !== null && plan.by !== self ? ` · ${t.fromSession(plan.byFolder)}` : ''
      status.push({ key: 'shutdown', text: `${strings(lang, plan.mode).shutdownPlanned(clockOf(plan.at))}${planFrom}`, color: 'warning' })
    }
    if (phase === 'pausing') {
      const left = await read($, pauseTasksLeft)
      // Paused for another session's shutdown, it says so too.
      const isForShutdown = shutting === 'requested' || (role === 'foreign' && request?.kind === 'shutdown')
      const asked = shutting === 'requested' ? t.shutdownRequested : isForShutdown ? tr.shutdownRequested : t.pauseRequested
      status.push({ key: 'pause', text: `${signs.requested} ${asked}${t.tasksLeft(left)}${from}`, color: 'warning' })
      // An approval on screen holds the pause up, and a shutdown with it, until someone answers: a mod cannot take it
      // back, so the band asks the person to (0.10.2). Claude's own question about long tasks is no approval.
      if (await read($, isAwaitingApproval)) status.push({ key: 'pause-approval', text: t.approvalOpen, color: 'warning' })
    } else if (phase === 'paused' && shutting !== 'countdown' && shutting !== 'shutting') {
      status.push({ key: 'pause', text: `${t.pausedFor(minutesBetween(await read($, pausedAt), at) ?? 0)}${from}` })
    }
    // Usage windows from 80 % on, fullest first: yellow, red from 95 % (0.10.0).
    for (const { reading, tone } of usageToShow(await read($, usageWindows))) {
      status.push({
        key: `usage-${reading.kind}`,
        text: t.usageLine(t.usageWindow(reading.kind), Math.round(reading.percentUsed), resetClock(reading.resetsAt, at, lang)),
        color: tone,
      })
    }
    // About how many turns until auto-compact, from 10 on, yellow from 3 (0.10.0). Only where the session reports its
    // own threshold: with auto-compact off, or none reported, nothing is forecast.
    if (!limit.isFallback && fill?.tokens !== null && fill?.tokens !== undefined && !compacting) {
      const turns = turnsToCompact(fill.tokens, (fill.window * limit.percent) / 100, await read($, turnGrowths))
      if (turns !== null && turns <= FORECAST_SHOW_TURNS) {
        status.push({ key: 'forecast', text: t.compactForecast(turns), color: turns <= FORECAST_WARN_TURNS ? 'warning' : 'subtle' })
      }
    }
    const withoutMod = await read($, sessionsWithoutMod)
    if (role === 'own' && withoutMod > 0) status.push({ key: 'without-mod', text: t.withoutMod(withoutMod), color: 'subtle' })
    if (noteText !== null) status.push({ key: 'keep-warm', text: `${t.keepWarm}: ${noteText}`, color: 'warning' })
    if (await read($, isCheckingShutdown)) status.push({ key: 'check', text: t.shutdownChecking, color: 'subtle' })
    const statusRows =
      status.length === 0 ? null : (
        <Box flexDirection="column">
          {status.map(line => (
            <Text key={`status-${line.key}`} wrap="truncate-end" {...(line.color === undefined ? {} : { color: line.color })}>
              {line.text}
            </Text>
          ))}
        </Box>
      )

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
      // Where the status row follows, the picture keeps as much room below the bar as above it.
      const hasRoomBelow = statusRows !== null
      bar = (
        <Svg source={svgBar(share, hasRoomBelow)} alt={t.cacheBarAlt(cacheText)} height={svgBarHeight(hasRoomBelow)} />
      )
    }

    // The press's own hook opens the overview (below); beneath it this writes the sign of life and the view it draws.
    const onSessions = async () => {
      await writeHeartbeat($)
      await refreshSessionsView($)
    }
    const sessionsButton = iconButton({ key: 'sessions', words: t.sessions, icon: BUTTON_ICONS.sessions, onPress: onSessions })
    const onCompact = async () => {
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
    }
    const compact = iconButton({
      key: 'compact',
      words: compacting ? t.compacting : t.compact,
      icon: BUTTON_ICONS.compact,
      onPress: onCompact,
      variant: isStorm ? 'primary' : 'secondary',
    })

    const ttlNote = life === null ? '' : life.source === 'remembered' ? ` (${life.minutes === 60 ? '1 h' : '5 m'}?)` : ''
    // The hit rate rides on the cache time, the threshold on the context: short in a terminal („Cache 60 m / 98 %“,
    // „Ctx 5 % / 97 %“), spelled out in the desktop app, where the readings have a row of their own („Cache noch 60 min ·
    // Treffer 98 %“, „Kontext 5 % · Auto-Compact bei 97 %“).
    const hitPercent = rate === null ? 0 : Math.round(rate * 100)
    const hits = isExpired || rate === null ? '' : isTerminal ? ` / ${hitPercent} %` : ` · ${t.hits(hitPercent)}`
    // In the desktop app a narrow band squeezed the readings until „Hits 100 %“ broke over two lines and the cache time
    // was cut („Cache 6…“): there they keep their width.
    const keep = isTerminal ? {} : { flexShrink: 0 }
    // Two groups, each close-knit: the readings with keep-warm between them, and the buttons. A terminal sets them a
    // full gap apart in one row. In the desktop app the buttons, icon and word, stand in a row of their own over the
    // readings, on the left, a spacing step between the two rows (2026-11-09): beside the readings they had no room,
    // and the person chose a band one row taller that never changes its height over icons alone or words shown on
    // hover, the buttons first. Compact comes first, then Sessions (the person's order).
    const readings = (
      <Box flexDirection="row" gap={1} {...(isTerminal ? {} : { marginTop: 'sm' as const })}>
        <Box {...keep}>
          <Text color={tone} wrap="truncate-end">
            {`${cacheText}${ttlNote}${hits}`}
          </Text>
        </Box>
        {keepWarmControl}
        <Box flexDirection="row" gap={1} {...keep}>
          {skyText}
          {isExpired ? null : (
            <Text>
              {isTerminal
                ? `${t.ctx} ${fillText} / ${limit.percent} %${limit.isFallback ? '*' : ''}`
                : t.context(fillText, limit.percent, limit.isFallback)}
            </Text>
          )}
        </Box>
      </Box>
    )
    const buttons = (
      <Box flexDirection="row" gap={1}>
        {compact}
        {sessionsButton}
        {pause}
      </Box>
    )
    return withBelow(
      <Box flexDirection="column">
        {isTerminal ? (
          <Box flexDirection="row" gap={2}>
            {readings}
            {buttons}
          </Box>
        ) : (
          buttons
        )}
        {isTerminal ? null : readings}
        {bar}
        {statusRows}
      </Box>,
    )
  })

  // The sessions button opens the overview from the press's own hook (2026-11-09): there `$` carries the person's
  // press, and a pane the person asks for is placed at any width. Opened through the band's closure, whose `$` is the
  // drawing's, it counted as opened unasked and waited undrawn in a terminal under 144 columns: the button did nothing
  // there. Should a surface still not place it, a toast says why.
  on('ui.press', { plugin: 'cache-weather-and-pause-resume', element: 'sessions' }, async ($, e, next) => {
    const t = strings(await currentLang($), shutdownMode)
    const opened = await $.ui.open({ id: SESSIONS_PANE, title: t.sessionsTitle })
    if (!opened.isPlaced) $.ui.toast(`${t.sessionsTitle}: ${opened.reason}`)
    return next(e)
  })

  // The sessions overview (0.10.0): each session that runs the mod, from its sign of life. It only shows; pause and
  // shutdown across sessions go through the band.
  on('ui.render', { component: 'Pane', requestId: SESSIONS_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lang = await currentLang($)
    const t = strings(lang, shutdownMode)
    // The minute's tick redraws it; the clock itself keeps it right before the first tick.
    const at = Math.max(await read($, now), await $.clock.now())
    const rows = await read($, sessionsView)
    const usage = await read($, usageWindows)
    const minutesSince = (from: number | null | undefined) =>
      from === null || from === undefined ? null : Math.max(0, Math.floor((at - from) / 60_000))
    const plan = await livePlan($)
    return (
      <Box flexDirection="column" gap={1}>
        {plan === null ? null : (
          <Text color="warning" wrap="truncate-end">
            {strings(lang, plan.mode).shutdownPlanned(clockOf(plan.at))}
          </Text>
        )}
        {usage.length === 0 ? null : (
          <Text dimColor wrap="truncate-end">
            {usage
              .map(w => t.usageLine(t.usageWindow(w.kind), Math.round(w.percentUsed), resetClock(w.resetsAt, at, lang)))
              .join('  ·  ')}
          </Text>
        )}
        {rows.length === 0 ? (
          <Text dimColor>
            {t.sessionsNone}
          </Text>
        ) : null}
        {rows.map(({ id, isSelf, entry }) => {
          const state =
            entry.phase === 'paused'
              ? 'paused'
              : entry.phase === 'pausing'
                ? 'pausing'
                : entry.isAwaitingPerson
                  ? 'awaiting'
                  : entry.workingSince !== null
                    ? 'working'
                    : 'idle'
          const since = state === 'paused' ? minutesSince(entry.pausedAt) : state === 'working' ? minutesSince(entry.workingSince) : null
          const details = [
            entry.contextPercent === null || entry.contextPercent === undefined
              ? null
              : `${t.ctx} ${entry.contextPercent} %${entry.thresholdPercent ? ` / ${entry.thresholdPercent} %` : ''}`,
            entry.cacheUntil === undefined ? null : t.sessionCache(entry.cacheUntil === null ? null : Math.ceil((entry.cacheUntil - at) / 60_000)),
            entry.keepWarm === undefined ? null : t.sessionKeepWarm(entry.keepWarm),
            entry.model ?? null,
          ].filter((part): part is string => part !== null)
          return (
            <Box key={`session-${id}`} flexDirection="column">
              <Text bold wrap="truncate-end">
                {`${entry.folder ?? id.slice(0, 8)}${isSelf ? ` · ${t.thisSession}` : ''}`}
              </Text>
              <Text
                color={state === 'paused' ? undefined : state === 'awaiting' ? 'warning' : undefined}
               
                wrap="truncate-end"
              >
                {t.sessionState(state, since)}
              </Text>
              {details.length === 0 ? null : (
                <Text dimColor wrap="truncate-end">
                  {details.join('  ·  ')}
                </Text>
              )}
              {entry.runs.length === 0 ? null : (
                <Text wrap="truncate-end">
                  {t.sessionRuns(entry.runs)}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
