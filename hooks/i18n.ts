// The band's and the toasts' words in German and English; no `$` here, so the tests read them directly.

import type { ShutdownReadiness } from '../types'

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
  ctx: string
  compact: string
  compacting: string
  pause: string
  resume: string
  pauseRequested: string
  tasksLeft: (n: number | null) => string
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
  shutdown: string
  shutdownCancel: string
  shutdownRequested: string
  shutdownIn: (seconds: number) => string
  shutdownRunning: string
  shutdownCancelled: string
  shutdownFailed: (error: string) => string
  shutdownChecking: string
  shutdownHelp: (readiness: Extract<ShutdownReadiness, { isReady: false }>) => string
  shutdownLog: string
}

const DE: Strings = {
  cacheUnknown: 'Cache ?',
  cacheNone: 'Cache –',
  cacheExpired: 'Cache abgelaufen',
  cacheMinutes: m => `Cache ${m} m`,
  ctx: 'Ctx',
  compact: 'Compact',
  compacting: 'Compact …',
  pause: 'Pause',
  resume: 'Weiter',
  pauseRequested: 'Pause angefordert',
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 Task läuft noch' : ` · ${n} Tasks laufen noch`),
  compactQueued: '/compact eingereiht: startet, sobald Claude fertig ist',
  compactQueueFailed: error => `/compact ließ sich nicht einreihen: ${error}`,
  compactSkipped: reason => `Compact übersprungen: ${reason}`,
  pauseRequestedToast: '⏸ Pause angefordert: Claude lässt Laufendes zu Ende laufen und sichert den Stand.',
  pausedToast: '⏸ Sitzung pausiert. „Weiter“ setzt fort.',
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
  shutdown: 'Shutdown',
  shutdownCancel: 'Abbrechen',
  shutdownRequested: 'Shutdown angefordert',
  shutdownIn: seconds => `Shutdown in ${seconds} s`,
  shutdownRunning: 'Fährt herunter …',
  shutdownCancelled: 'Shutdown abgebrochen. Die Pause bleibt, wie sie ist.',
  shutdownFailed: error => `Shutdown fehlgeschlagen: ${error}`,
  shutdownChecking: 'Shutdown: Die Voraussetzungen werden noch geprüft, gleich noch einmal versuchen.',
  shutdownHelp: r =>
    r.reason === 'no-right'
      ? 'Shutdown ist nicht verfügbar: Deinem Windows-Konto fehlt das Recht „Herunterfahren des Systems“ (SeShutdownPrivilege). Ein Administrator vergibt es unter Lokale Sicherheitsrichtlinie → Lokale Richtlinien → Zuweisen von Benutzerrechten → „Herunterfahren des Systems“. Danach eine neue Sitzung öffnen.'
      : r.os === 'linux'
        ? 'Shutdown ist nicht verfügbar: Deine Sitzung darf diesen Linux-Rechner nicht ohne Rückfrage ausschalten. Entweder antwortet `loginctl can-power-off` mit „yes“ (bei einer lokalen Desktop-Anmeldung meist so), oder sudo erlaubt `shutdown` ohne Passwort: `sudo visudo -f /etc/sudoers.d/shutdown` mit der Zeile `DEIN_NAME ALL=(root) NOPASSWD: PFAD` (PFAD aus `command -v shutdown`). Danach eine neue Sitzung öffnen.'
        : r.os === 'macos'
          ? 'Shutdown ist nicht verfügbar: macOS fährt ohne Rückfrage nur mit sudo herunter. Einmal einrichten: `sudo visudo -f /etc/sudoers.d/shutdown` mit der Zeile `DEIN_NAME ALL=(root) NOPASSWD: /sbin/shutdown`. Danach eine neue Sitzung öffnen.'
          : r.reason === 'check-failed'
            ? 'Shutdown ist nicht verfügbar: Die Prüfung der Voraussetzungen ließ sich nicht ausführen. Eine neue Sitzung prüft erneut.'
            : 'Shutdown ist nicht verfügbar: Das Betriebssystem wurde nicht erkannt (Windows, Linux und macOS werden unterstützt).',
  shutdownLog: '⏻ Shutdown: Die Sitzung ist pausiert, der Rechner fährt jetzt herunter.',
}

const EN: Strings = {
  cacheUnknown: 'Cache ?',
  cacheNone: 'Cache –',
  cacheExpired: 'Cache expired',
  cacheMinutes: m => `Cache ${m} m`,
  ctx: 'Ctx',
  compact: 'Compact',
  compacting: 'Compact …',
  pause: 'Pause',
  resume: 'Resume',
  pauseRequested: 'Pause requested',
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 task still running' : ` · ${n} tasks still running`),
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
  shutdown: 'Shutdown',
  shutdownCancel: 'Cancel',
  shutdownRequested: 'Shutdown requested',
  shutdownIn: seconds => `Shutdown in ${seconds} s`,
  shutdownRunning: 'Shutting down …',
  shutdownCancelled: 'Shutdown cancelled. The pause stays as it is.',
  shutdownFailed: error => `Shutdown failed: ${error}`,
  shutdownChecking: 'Shutdown: still checking what it needs, try again in a moment.',
  shutdownHelp: r =>
    r.reason === 'no-right'
      ? 'Shutdown is not available: your Windows account lacks the right "Shut down the system" (SeShutdownPrivilege). An administrator grants it under Local Security Policy → Local Policies → User Rights Assignment → "Shut down the system". Then open a new session.'
      : r.os === 'linux'
        ? 'Shutdown is not available: your session may not power this Linux machine off without being asked. Either `loginctl can-power-off` answers "yes" (usually so for a local desktop login), or sudo allows `shutdown` without a password: `sudo visudo -f /etc/sudoers.d/shutdown` with the line `YOUR_NAME ALL=(root) NOPASSWD: PATH` (PATH from `command -v shutdown`). Then open a new session.'
        : r.os === 'macos'
          ? 'Shutdown is not available: macOS shuts down without being asked only through sudo. Set it up once: `sudo visudo -f /etc/sudoers.d/shutdown` with the line `YOUR_NAME ALL=(root) NOPASSWD: /sbin/shutdown`. Then open a new session.'
          : r.reason === 'check-failed'
            ? 'Shutdown is not available: the check of what it needs could not run. A new session checks again.'
            : 'Shutdown is not available: the operating system was not recognised (Windows, Linux and macOS are supported).',
  shutdownLog: '⏻ Shutdown: the session is paused, the computer shuts down now.',
}

export function strings(lang: Lang): Strings {
  return lang === 'de' ? DE : EN
}
