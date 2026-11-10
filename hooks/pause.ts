// The pause button's words to the model and the rules it reads the prompts by; no `$` here, so the tests read them
// directly. The words follow the mod's language; reading what the person types understands both languages.

import { modeWords } from './i18n'
import type { Lang } from './i18n'
import type { ShutdownMode } from '../types'

export const PLUGIN = 'cache-weather-and-pause-resume'
export const DEFAULT_ASK_ABOVE_MINUTES = 5

/** The tool Claude tells the band with that the session is paused, or running again: its short and its full name. */
export const PAUSE_TOOL_NAME = 'pause_state'
export const PAUSE_TOOL = 'mcp__cache-weather-and-pause-resume__pause_state'

/**
 * What Claude reads about the tool. A pause asked for in any words or language gets the same steps as the button's,
 * and the band learns of it only once Claude is done pausing.
 */
export function pauseToolDescription(askAboveMinutes: number): string {
  const minutes = formatMinutes(askAboveMinutes, 'en')
  return [
    'Tells the band above the prompt whether this session is paused: it then shows the person a Resume button (and keeps it across a restart of the app), or the Pause button again.',
    '',
    `Call it with state "paused" once the person has asked you to pause the session, in any words or language (typed, or with the band's button), and you have finished pausing: you started nothing new; running background work has finished, or, for a task likely to run longer than ${minutes} or without a foreseeable end, you asked the person whether to stop it now and restart it after resuming; and you saved the state as this project's rules say (what is done, what ran, what was stopped and how to restart it, what comes next). Then report "Paused" briefly and wait; run no scheduled wakeups during the pause.`,
    '',
    'Call it with state "running" when the person asks you to pick the paused work back up, in any words or language, before you carry on.',
    '',
    'Do not call it for a question during a pause that you only answer, or for pausing something else (a test run, a timer, a video).',
  ].join('\n')
}

/** What the „Weiter“ / „Resume“ button submits, as the person would type it. */
export function resumeText(lang: Lang): string {
  return lang === 'de' ? 'weitermachen' : 'continue'
}

/** The request the „Pause“ button (or a typed „pausieren“ / „pause“) hands the model. */
export function pauseRequest(askAboveMinutes: number, lang: Lang): string {
  const minutes = formatMinutes(askAboveMinutes, lang)
  if (lang === 'de') {
    return [
      '⏸ Pause-Knopf: Der Mensch bittet dich, die Sitzung zu pausieren.',
      '',
      '1. Starte ab jetzt nichts Neues mehr: keine neuen Arbeitsschritte, Läufe, Agenten oder Werkzeugaufrufe dafür. Was gerade läuft, läuft zu Ende. Schritte, die eine Freigabe des Menschen bräuchten, führst du nicht mehr aus: notiere sie für nach „weitermachen“.',
      `2. Prüfe die laufenden Hintergrund-Tasks (Läufe, Agenten, Monitore, Workflows) und schätze je Task die ungefähre Restlaufzeit. Braucht einer voraussichtlich noch länger als ${minutes} (oder hat er kein absehbares Ende), frag den Menschen, als Dialog (AskUserQuestion), sofern verfügbar, und nenne je Task die Restlaufzeit: „jetzt beenden und nach ‚weitermachen‘ neu starten“ (nur anbieten, wenn der Task einen Neustart zulässt, sonst sag, warum nicht) oder „zu Ende laufen lassen“. Kürzere Tasks wartest du ohne Rückfrage ab: beende deinen Zug, du wirst bei ihrem Ende geweckt, und sichere dann auch ihr Ergebnis.`,
      '3. Sichere den aktuellen Stand nach den Regeln dieses Projekts (CLAUDE.md, Memory), so dass du nach „weitermachen“ nahtlos fortsetzen kannst: was erledigt ist, was lief, was abgebrochen wurde und mit welchem Befehl es neu startet, was als Nächstes kommt. Gibt das Projekt keine Regel vor, verwirf nichts und committe nicht ungefragt; dann hält deine Pausen-Meldung den Stand fest.',
      '4. Rufe dann das Werkzeug pause_state mit state „paused“ auf, melde kurz „Pausiert“ mit diesem Stand (keinen Übergabe-Prompt) und beende deinen Zug. Danach tust du nichts mehr, bis der Mensch „weitermachen“ schreibt oder den Knopf „Weiter“ drückt. Geplante Weckungen (Cron, /loop, ScheduleWakeup) führst du in der Pause nicht aus.',
    ].join('\n')
  }
  return [
    '⏸ Pause button: the person asks you to pause the session.',
    '',
    '1. From now on, start nothing new: no new work steps, runs, agents or tool calls for them. Whatever is running finishes. Steps that would need the person\'s approval you no longer run: note them for after "continue".',
    `2. Check the running background tasks (runs, agents, monitors, workflows) and estimate each one's remaining time. If one will likely take longer than ${minutes} (or has no foreseeable end), ask the person, as a dialog (AskUserQuestion) where available, naming each task's remaining time: "stop it now and restart it after 'continue'" (offer this only if the task can be restarted, otherwise say why not) or "let it finish". Wait for shorter tasks without asking: end your turn, you will be woken when they finish, and then save their results too.`,
    "3. Save the current state following this project's rules (CLAUDE.md, memory) so you can pick up seamlessly after \"continue\": what is done, what was running, what was stopped and the command that restarts it, what comes next. If the project sets no rule, discard nothing and do not commit unasked; your pause report then records the state.",
    '4. Then call the tool pause_state with state "paused", report "Paused" briefly with this state (no handoff prompt) and end your turn. After that, do nothing until the person writes "continue" or presses the "Resume" button. Do not run scheduled wakeups (cron, /loop, ScheduleWakeup) during the pause.',
  ].join('\n')
}

/** Beside the pause request when the shutdown button asked for it: the person leaves once Claude has asked. */
export function shutdownNote(lang: Lang, mode: ShutdownMode = 'shutdown'): string {
  if (mode === 'shutdown') {
    return lang === 'de'
      ? '⏻ Shutdown-Knopf: Nach dieser Pause fährt der Mod den Rechner herunter, und der Mensch geht weg. Stell Rückfragen zu langen Tasks deshalb sofort, bevor du anderes tust, solange der Mensch noch da ist; danach fragst du nichts mehr. Fahre den Rechner nicht selbst herunter, das übernimmt der Mod.'
      : '⏻ Shutdown button: after this pause the mod shuts the computer down, and the person leaves. So ask about long tasks right away, before anything else, while the person is still there; ask nothing after that. Do not shut the computer down yourself; the mod does.'
  }
  const w = modeWords(mode, lang)
  return lang === 'de'
    ? `⏾ ${w.label}-Knopf: Nach dieser Pause wird der Mod ${w.doIt}, und der Mensch geht weg; laufende Tasks stehen dann still und brechen oft ab. Stell Rückfragen zu langen Tasks deshalb sofort, bevor du anderes tust, solange der Mensch noch da ist; danach fragst du nichts mehr. Tu das nicht selbst, das übernimmt der Mod.`
    : `⏾ ${w.label} button: after this pause the mod will ${w.doIt}, and the person leaves; running tasks then stand still and often break. So ask about long tasks right away, before anything else, while the person is still there; ask nothing after that. Do not do it yourself; the mod does.`
}

/** What the model reads beside „weitermachen“ / „continue“. */
export function resumeContext(pausedMinutes: number | null, lang: Lang): string {
  if (lang === 'de') {
    const length = pausedMinutes === null ? '' : ` (sie dauerte ${formatMinutes(pausedMinutes, lang)})`
    return `▶ Pause-Knopf: Die Pause ist beendet${length}. Setze die Arbeit am gesicherten Stand fort: starte zuerst die bei der Pause beendeten Tasks neu, wo das vereinbart war, dann weiter wie geplant.`
  }
  const length = pausedMinutes === null ? '' : ` (it lasted ${formatMinutes(pausedMinutes, lang)})`
  return `▶ Pause button: the pause is over${length}. Carry on from the saved state: first restart the tasks stopped for the pause where that was agreed, then continue as planned.`
}

/** Beside a message of the person's while the session is paused. */
export function pausedPersonNote(lang: Lang): string {
  return lang === 'de'
    ? '⏸ Pause-Knopf: Die Sitzung ist pausiert. Geh auf diese Nachricht ein. Die pausierte Arbeit nimmst du erst wieder auf, wenn der Mensch darum bittet, in welchen Worten auch immer; dann rufe zuerst das Werkzeug pause_state mit state „running“ auf. Neue Läufe startest du nur, wenn diese Nachricht es ausdrücklich verlangt.'
    : '⏸ Pause button: the session is paused. Respond to this message. Resume the paused work only when the person asks for it, in whatever words; then first call the tool pause_state with state "running". Start new runs only if this message explicitly asks for them.'
}

/** Beside a task notification, a scheduled wakeup or another session's message while paused. */
export function pausedMachineNote(lang: Lang): string {
  return lang === 'de'
    ? '⏸ Pause-Knopf: Die Sitzung ist pausiert. Starte nichts: sichere höchstens ein Ergebnis, das hier ankommt, vermerke es in einem Satz und beende deinen Zug.'
    : '⏸ Pause button: the session is paused. Start nothing: at most save a result that arrives here, note it in one sentence and end your turn.'
}

/** Beside any message while the pause is asked for and Claude is still finishing up. */
export function pausingNote(lang: Lang): string {
  return lang === 'de'
    ? '⏸ Pause-Knopf: Eine Pause ist angefordert. Starte nichts Neues; sobald nichts mehr läuft, sichere den Stand, rufe das Werkzeug pause_state mit state „paused“ auf, melde „Pausiert“ und warte auf „weitermachen“.'
    : '⏸ Pause button: a pause has been requested. Start nothing new; once nothing is running any more, save the state, call the tool pause_state with state "paused", report "Paused" and wait for "continue".'
}

// A whole message of „weitermachen“ / „continue“ and their kin, or one that starts with one of them and says more.
const RESUME_WHOLE =
  /^\s*(weiter|weitermachen|weiter machen|fortsetzen|fortfahren|mach weiter|resume|continue|go on|carry on)\s*[.!]*\s*$/i
const RESUME_START = /^\s*(weitermachen|weiter machen|mach weiter|continue|resume)\b/i
// Only a whole message pauses: „pausiere die Läufe nicht“ / „pause the music in the test“ must not.
const PAUSE_WHOLE =
  /^\s*((bitte|please)\s+)?(pause|pausieren|pausiere|pausier)(\s+(bitte|die sitzung|jetzt|please|the session|now))?\s*[.!]*\s*$/i

export function isResume(text: string): boolean {
  return RESUME_WHOLE.test(text) || RESUME_START.test(text)
}

export function isPauseCommand(text: string): boolean {
  return PAUSE_WHOLE.test(text)
}

/** Prompt origins that are not the person: their text never pauses or resumes, and they read the machine note. */
const MACHINE_ORIGINS = new Set([
  'task-notification',
  'scheduled-trigger',
  'peer',
  'peer-send-message',
  'projects-relay',
  'coordinator',
  'observer',
  'observer-activity',
])

export type OriginLike = { kind: string; name?: string } | undefined

export function isOwnOrigin(origin: OriginLike): boolean {
  return origin?.kind === 'plugin' && origin.name === PLUGIN
}

export function isPersonOrigin(origin: OriginLike): boolean {
  if (origin === undefined) return true
  if (origin.kind === 'plugin') return origin.name === PLUGIN
  return !MACHINE_ORIGINS.has(origin.kind)
}

const DONE = new Set(['completed', 'complete', 'done', 'failed', 'killed', 'stopped', 'cancelled', 'canceled', 'error'])

/** The background tasks still in flight: the Stop hook's list holds only those, the filter is a guard. */
export function inFlight(tasks: readonly { status: string }[] | undefined): number {
  return (tasks ?? []).filter(t => !DONE.has(t.status.toLowerCase())).length
}

/** The background tasks still in flight, by their description: what another session's question names. */
export function runsInFlight(
  tasks: readonly { status: string; description?: string; type?: string }[] | undefined,
): string[] {
  return (tasks ?? [])
    .filter(t => !DONE.has(t.status.toLowerCase()))
    .map(t => (t.description ?? t.type ?? '').trim() || '?')
}

export function minutesBetween(from: number | null, to: number): number | null {
  if (from === null || to < from) return null
  return Math.floor((to - from) / 60_000)
}

export function formatMinutes(minutes: number, lang: Lang): string {
  if (minutes < 60) {
    if (lang === 'de') return minutes === 1 ? '1 Minute' : `${minutes} Minuten`
    return minutes === 1 ? '1 minute' : `${minutes} minutes`
  }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

export function askAboveMinutes(options: Readonly<Record<string, unknown>>): number {
  const value = options.askAboveMinutes
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : DEFAULT_ASK_ABOVE_MINUTES
}
