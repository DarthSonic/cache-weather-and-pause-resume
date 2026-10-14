// The band's and the toasts' words in German and English; no `$` here, so the tests read them directly.

export type Lang = 'de' | 'en'

/** A language from a setting or a locale (`de`, `de-DE`, `German`, `deutsch`, `en_US.UTF-8`); null when empty. */
export function langOf(value: unknown): Lang | null {
  const s = String(value ?? '').trim().toLowerCase()
  if (!s || s === 'auto') return null
  if (s === 'de' || /^de[-_.]/.test(s) || s.includes('german') || s.includes('deutsch')) return 'de'
  return 'en'
}

/** The host's locale as the module's own runtime reports it (the system's language on Windows, where LANG is unset). */
export function runtimeLocale(): string | null {
  try {
    return typeof Intl === 'undefined' ? null : Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return null
  }
}

export type Strings = {
  cacheUnknown: string
  cacheNone: string
  cacheExpired: string
  cacheMinutes: (minutes: number) => string
  hits: string
  ctx: string
  max: string
  compact: string
  compacting: string
  pause: string
  resume: string
  pauseRequested: string
  tasksLeft: (n: number | null) => string
  paused: (since: string) => string
  compactQueued: string
  compactQueueFailed: (error: string) => string
  compactSkipped: (reason: string) => string
  pauseRequestedToast: string
  pausedToast: string
  sendFailed: (error: string) => string
  resumeSendFailed: (error: string) => string
}

const DE: Strings = {
  cacheUnknown: 'Cache ?',
  cacheNone: 'Cache –',
  cacheExpired: 'Cache abgelaufen',
  cacheMinutes: m => `Cache ${m} m`,
  hits: 'Hits',
  ctx: 'Ctx',
  max: 'Max',
  compact: 'Compact',
  compacting: 'Compact …',
  pause: '⏸ Pause',
  resume: '▶ Weitermachen',
  pauseRequested: '⏳ Pause angefordert',
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 Task läuft noch' : ` · ${n} Tasks laufen noch`),
  paused: since => `pausiert ${since}`,
  compactQueued: '/compact eingereiht: startet, sobald Claude fertig ist',
  compactQueueFailed: error => `/compact ließ sich nicht einreihen: ${error}`,
  compactSkipped: reason => `Compact übersprungen: ${reason}`,
  pauseRequestedToast: '⏸ Pause angefordert: Claude lässt Laufendes zu Ende laufen und sichert den Stand.',
  pausedToast: '⏸ Sitzung pausiert. „Weitermachen“ setzt fort.',
  sendFailed: error => `Pause: die Nachricht an Claude ließ sich nicht senden: ${error}`,
  resumeSendFailed: error => `Pause: „weitermachen“ ließ sich nicht senden: ${error}`,
}

const EN: Strings = {
  cacheUnknown: 'Cache ?',
  cacheNone: 'Cache –',
  cacheExpired: 'Cache expired',
  cacheMinutes: m => `Cache ${m} m`,
  hits: 'Hits',
  ctx: 'Ctx',
  max: 'Max',
  compact: 'Compact',
  compacting: 'Compact …',
  pause: '⏸ Pause',
  resume: '▶ Resume',
  pauseRequested: '⏳ Pause requested',
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 task still running' : ` · ${n} tasks still running`),
  paused: since => `paused ${since}`,
  compactQueued: '/compact queued: it starts once Claude is done',
  compactQueueFailed: error => `/compact could not be queued: ${error}`,
  compactSkipped: reason => `Compact skipped: ${reason}`,
  pauseRequestedToast: '⏸ Pause requested: Claude lets running work finish and saves the state.',
  pausedToast: '⏸ Session paused. “Resume” carries on.',
  sendFailed: error => `Pause: the message to Claude could not be sent: ${error}`,
  resumeSendFailed: error => `Pause: “continue” could not be sent: ${error}`,
}

export function strings(lang: Lang): Strings {
  return lang === 'de' ? DE : EN
}
