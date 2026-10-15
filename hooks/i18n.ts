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
  keepWarm: string
  keepWarmEnded: (span: string) => string
  keepWarmMissed: string
  keepWarmCold: string
  keepWarmRefreshedLog: (read: string, out: string) => string
  keepWarmEndedLog: (span: string, ttl: string) => string
  keepWarmMissedLog: string
  cacheBarAlt: (cache: string) => string
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
  pause: 'Pause',
  resume: 'Weitermachen',
  pauseRequested: 'Pause angefordert',
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 Task läuft noch' : ` · ${n} Tasks laufen noch`),
  paused: since => `pausiert ${since}`,
  compactQueued: '/compact eingereiht: startet, sobald Claude fertig ist',
  compactQueueFailed: error => `/compact ließ sich nicht einreihen: ${error}`,
  compactSkipped: reason => `Compact übersprungen: ${reason}`,
  pauseRequestedToast: '⏸ Pause angefordert: Claude lässt Laufendes zu Ende laufen und sichert den Stand.',
  pausedToast: '⏸ Sitzung pausiert. „Weitermachen“ setzt fort.',
  sendFailed: error => `Pause: die Nachricht an Claude ließ sich nicht senden: ${error}`,
  resumeSendFailed: error => `Pause: „weitermachen“ ließ sich nicht senden: ${error}`,
  keepWarm: 'Keep-warm',
  keepWarmEnded: span => `endete nach ${span} ohne Eingabe`,
  keepWarmMissed: 'Cache war schon abgelaufen',
  keepWarmCold: 'wartet auf die nächste Anfrage',
  keepWarmRefreshedLog: (read, out) => `↻ Keep-warm: Cache aufgefrischt (${read} Tokens aus dem Cache gelesen, ${out} Tokens Antwort)`,
  keepWarmEndedLog: (span, ttl) =>
    `Keep-warm: nach ${span} ohne Eingabe nicht weiter aufgefrischt. Das ist die Grenze beim ${ttl}-Cache, damit eine vergessene Sitzung kein Kontingent mehr verbraucht. Die nächste Eingabe baut den Cache neu auf, dann hält Keep-warm ihn wieder warm.`,
  keepWarmMissedLog:
    'Keep-warm: Der Cache war schon abgelaufen, die Auffrischung hat ihn nicht mehr erreicht. Nach der nächsten Anfrage hält Keep-warm ihn wieder warm.',
  cacheBarAlt: cache => `Restlaufzeit des Caches: ${cache}`,
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
  pause: 'Pause',
  resume: 'Resume',
  pauseRequested: 'Pause requested',
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 task still running' : ` · ${n} tasks still running`),
  paused: since => `paused ${since}`,
  compactQueued: '/compact queued: it starts once Claude is done',
  compactQueueFailed: error => `/compact could not be queued: ${error}`,
  compactSkipped: reason => `Compact skipped: ${reason}`,
  pauseRequestedToast: '⏸ Pause requested: Claude lets running work finish and saves the state.',
  pausedToast: '⏸ Session paused. “Resume” carries on.',
  sendFailed: error => `Pause: the message to Claude could not be sent: ${error}`,
  resumeSendFailed: error => `Pause: “continue” could not be sent: ${error}`,
  keepWarm: 'Keep-warm',
  keepWarmEnded: span => `stopped after ${span} without input`,
  keepWarmMissed: 'the cache had already expired',
  keepWarmCold: 'waiting for the next request',
  keepWarmRefreshedLog: (read, out) => `↻ Keep-warm: cache refreshed (${read} tokens read from the cache, ${out} tokens of reply)`,
  keepWarmEndedLog: (span, ttl) =>
    `Keep-warm: no more refreshes after ${span} without input. That is the limit for the ${ttl} cache, so a forgotten session spends no more usage. The next input builds the cache afresh, and keep-warm keeps it warm again.`,
  keepWarmMissedLog:
    'Keep-warm: the cache had already expired, so the refresh no longer reached it. After the next request keep-warm keeps it warm again.',
  cacheBarAlt: cache => `Cache time left: ${cache}`,
}

export function strings(lang: Lang): Strings {
  return lang === 'de' ? DE : EN
}
