// The band's and the toasts' words in German and English; no `$` here, so the tests read them directly.

import type { ShutdownMode, ShutdownReadiness } from '../types'

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

// A pause's length as the status row shows it: never „0 min“, and hours from the first hour on.
function duration(minutes: number): string {
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

// The countdown as the status row shows it: minutes and seconds from a minute on, seconds below.
function clock(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// A span as the notification names it: whole minutes where it is some, else seconds.
function span(seconds: number): string {
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`
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
  /** How long the session has been paused, in whole minutes. */
  pausedFor: (minutes: number) => string
  tasksLeft: (n: number | null) => string
  compactQueued: string
  compactQueueFailed: (error: string) => string
  compactSkipped: (reason: string) => string
  sendFailed: (error: string) => string
  resumeSendFailed: (error: string) => string
  keepWarm: string
  keepWarmEnded: (span: string) => string
  keepWarmMissed: string
  keepWarmCold: string
  /** Keep-warm stopped for a usage window at or past 90 %. */
  keepWarmLimit: (percent: number) => string
  keepWarmLimitLog: (window: string, percent: number) => string
  /** A usage window as the status row shows it: its name, how full, when it starts over. */
  usageWindow: (kind: string) => string
  usageLine: (window: string, percent: number, reset: string | null) => string
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
  /** The notification as the countdown starts: its heading, and the body naming the session's folder. */
  shutdownNotifyTitle: (seconds: number) => string
  shutdownNotifyBody: (folder: string | null) => string
  /** Whom the shutdown waits for, by folder. */
  waitingFor: (folders: readonly string[]) => string
  /** Sessions at work that run without the mod: they go down unpaused. */
  withoutMod: (count: number) => string
  /** Behind a pause another session asked for. */
  fromSession: (folder: string | null) => string
  /** Why the countdown ran nothing: the option changed while it ran. */
  modeChanged: string
}

const DE: Omit<Strings, keyof ModeTexts> = {
  cacheUnknown: 'Cache ?',
  cacheNone: 'Cache –',
  cacheExpired: 'Cache abgelaufen',
  cacheMinutes: m => `Cache ${m} m`,
  ctx: 'Ctx',
  compact: 'Compact',
  compacting: 'Compact …',
  pause: 'Pause',
  resume: 'Weiter',
  pauseRequested: 'Pause wird vorbereitet …',
  pausedFor: m => `Pausiert seit ${duration(m)}`,
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 Task läuft noch' : ` · ${n} Tasks laufen noch`),
  compactQueued: '/compact eingereiht: startet, sobald Claude fertig ist',
  compactQueueFailed: error => `/compact ließ sich nicht einreihen: ${error}`,
  compactSkipped: reason => `Compact übersprungen: ${reason}`,
  sendFailed: error => `Pause: die Nachricht an Claude ließ sich nicht senden: ${error}`,
  resumeSendFailed: error => `Pause: „weitermachen“ ließ sich nicht senden: ${error}`,
  keepWarm: 'Keep-warm',
  keepWarmEnded: span => `endete nach ${span} ohne Eingabe`,
  keepWarmMissed: 'Cache war schon abgelaufen',
  keepWarmCold: 'wartet auf die nächste Anfrage',
  keepWarmLimit: percent => `hält an, Kontingent bei ${percent} %`,
  keepWarmLimitLog: (window, percent) =>
    `Keep-warm: hält an, weil das ${window} bei ${percent} % steht. Eine Auffrischung würde den Rest verbrauchen. Ist das Fenster zurückgesetzt, frischt Keep-warm wieder auf.`,
  usageWindow: kind =>
    kind === 'five_hour' ? '5-h-Limit' : kind === 'seven_day' ? '7-Tage-Limit' : kind === 'spend_limit' ? 'Ausgabenlimit' : kind,
  usageLine: (window, percent, reset) => `${window} ${percent} %${reset === null ? '' : ` · neu ${reset.includes(' ') ? '' : 'um '}${reset}`}`,
  keepWarmRefreshedLog: (read, out) => `↻ Keep-warm: Cache aufgefrischt (${read} Tokens aus dem Cache gelesen, ${out} Tokens Antwort)`,
  keepWarmEndedLog: (span, ttl) =>
    `Keep-warm: nach ${span} ohne Eingabe nicht weiter aufgefrischt. Das ist die Grenze beim ${ttl}-Cache, damit eine vergessene Sitzung kein Kontingent mehr verbraucht. Die nächste Eingabe baut den Cache neu auf, dann hält Keep-warm ihn wieder warm.`,
  keepWarmMissedLog:
    'Keep-warm: Der Cache war schon abgelaufen, die Auffrischung hat ihn nicht mehr erreicht. Nach der nächsten Anfrage hält Keep-warm ihn wieder warm.',
  cacheBarAlt: cache => `Restlaufzeit des Caches: ${cache}`,
  shutdownCancel: 'Abbrechen',
  withoutMod: n =>
    n === 1
      ? '1 weitere Sitzung arbeitet ohne den Mod und wird nicht pausiert'
      : `${n} weitere Sitzungen arbeiten ohne den Mod und werden nicht pausiert`,
  fromSession: folder => (folder === null ? 'aus einer anderen Sitzung' : `aus ${folder}`),
  modeChanged: 'Die Option shutdownMode hat sich geändert. Die Pause bleibt; drück den Knopf noch einmal.',
}

const EN: Omit<Strings, keyof ModeTexts> = {
  cacheUnknown: 'Cache ?',
  cacheNone: 'Cache –',
  cacheExpired: 'Cache expired',
  cacheMinutes: m => `Cache ${m} m`,
  ctx: 'Ctx',
  compact: 'Compact',
  compacting: 'Compact …',
  pause: 'Pause',
  resume: 'Resume',
  pauseRequested: 'Preparing the pause …',
  pausedFor: m => `Paused for ${duration(m)}`,
  tasksLeft: n => (n === null || n <= 0 ? '' : n === 1 ? ' · 1 task still running' : ` · ${n} tasks still running`),
  compactQueued: '/compact queued: it starts once Claude is done',
  compactQueueFailed: error => `/compact could not be queued: ${error}`,
  compactSkipped: reason => `Compact skipped: ${reason}`,
  sendFailed: error => `Pause: the message to Claude could not be sent: ${error}`,
  resumeSendFailed: error => `Pause: “continue” could not be sent: ${error}`,
  keepWarm: 'Keep-warm',
  keepWarmEnded: span => `stopped after ${span} without input`,
  keepWarmMissed: 'the cache had already expired',
  keepWarmCold: 'waiting for the next request',
  keepWarmLimit: percent => `stopped, usage at ${percent} %`,
  keepWarmLimitLog: (window, percent) =>
    `Keep-warm: stopped because the ${window} stands at ${percent} %. A refresh would spend the rest of it. Once the window starts over, keep-warm refreshes again.`,
  usageWindow: kind =>
    kind === 'five_hour' ? '5-hour limit' : kind === 'seven_day' ? '7-day limit' : kind === 'spend_limit' ? 'Spend limit' : kind,
  usageLine: (window, percent, reset) => `${window} ${percent} %${reset === null ? '' : ` · resets ${reset.includes(' ') ? '' : 'at '}${reset}`}`,
  keepWarmRefreshedLog: (read, out) => `↻ Keep-warm: cache refreshed (${read} tokens read from the cache, ${out} tokens of reply)`,
  keepWarmEndedLog: (span, ttl) =>
    `Keep-warm: no more refreshes after ${span} without input. That is the limit for the ${ttl} cache, so a forgotten session spends no more usage. The next input builds the cache afresh, and keep-warm keeps it warm again.`,
  keepWarmMissedLog:
    'Keep-warm: the cache had already expired, so the refresh no longer reached it. After the next request keep-warm keeps it warm again.',
  cacheBarAlt: cache => `Cache time left: ${cache}`,
  shutdownCancel: 'Cancel',
  withoutMod: n =>
    n === 1
      ? '1 more session is at work without the mod and is not paused'
      : `${n} more sessions are at work without the mod and are not paused`,
  fromSession: folder => (folder === null ? 'from another session' : `from ${folder}`),
  modeChanged: 'the option shutdownMode changed. The pause stays; press the button again.',
}

// The texts that name what the button does: shut down, standby or hibernation (option `shutdownMode`, 0.9.5).
type ModeTexts = Pick<
  Strings,
  | 'shutdown'
  | 'shutdownRequested'
  | 'shutdownIn'
  | 'shutdownRunning'
  | 'shutdownCancelled'
  | 'shutdownFailed'
  | 'shutdownChecking'
  | 'shutdownHelp'
  | 'shutdownLog'
  | 'shutdownNotifyTitle'
  | 'shutdownNotifyBody'
  | 'waitingFor'
>

/** The words for what the button does: its label, and what the computer does, for the band and for Claude. */
export function modeWords(
  mode: ShutdownMode,
  lang: Lang,
): { label: string; running: string; soon: string; now: string; doIt: string } {
  if (lang === 'de') {
    if (mode === 'sleep') {
      return {
        label: 'Standby',
        running: 'Geht in den Standby …',
        soon: 'geht gleich in den Standby',
        now: 'geht jetzt in den Standby',
        doIt: 'den Rechner in den Standby schicken',
      }
    }
    if (mode === 'hibernate') {
      return {
        label: 'Ruhezustand',
        running: 'Geht in den Ruhezustand …',
        soon: 'geht gleich in den Ruhezustand',
        now: 'geht jetzt in den Ruhezustand',
        doIt: 'den Rechner in den Ruhezustand schicken',
      }
    }
    return {
      label: 'Shutdown',
      running: 'Fährt herunter …',
      soon: 'fährt gleich herunter',
      now: 'fährt jetzt herunter',
      doIt: 'den Rechner herunterfahren',
    }
  }
  if (mode === 'sleep') {
    return { label: 'Sleep', running: 'Going to sleep …', soon: 'goes to sleep shortly', now: 'goes to sleep now', doIt: 'put the computer to sleep' }
  }
  if (mode === 'hibernate') {
    return { label: 'Hibernate', running: 'Hibernating …', soon: 'hibernates shortly', now: 'hibernates now', doIt: 'hibernate the computer' }
  }
  return { label: 'Shutdown', running: 'Shutting down …', soon: 'shuts down shortly', now: 'shuts down now', doIt: 'shut the computer down' }
}

function modeTexts(lang: Lang, mode: ShutdownMode): ModeTexts {
  const w = modeWords(mode, lang)
  if (lang === 'de') {
    const missing = `${w.label} ist nicht verfügbar:`
    return {
      shutdown: w.label,
      shutdownRequested: `${w.label} wird vorbereitet …`,
      shutdownIn: seconds => `${w.label} in ${clock(seconds)}`,
      shutdownRunning: w.running,
      shutdownCancelled: `${w.label} abgebrochen. Die Pause bleibt, wie sie ist.`,
      shutdownFailed: error => `${w.label} fehlgeschlagen: ${error}`,
      shutdownChecking: `${w.label}: Die Voraussetzungen werden geprüft …`,
      shutdownHelp: r =>
        r.reason === 'no-right'
          ? `${missing} Deinem Windows-Konto fehlt das Recht „Herunterfahren des Systems“ (SeShutdownPrivilege). Ein Administrator vergibt es unter Lokale Sicherheitsrichtlinie → Lokale Richtlinien → Zuweisen von Benutzerrechten → „Herunterfahren des Systems“. Danach eine neue Sitzung öffnen.`
          : r.reason === 'no-hibernate'
            ? r.os === 'windows'
              ? `${missing} Windows hat den Ruhezustand ausgeschaltet. Einschalten in einer Eingabeaufforderung als Administrator mit \`powercfg /hibernate on\`, danach eine neue Sitzung öffnen; oder mit der Option \`shutdownMode\` „sleep“ (Standby) oder „shutdown“ wählen.`
              : r.os === 'linux'
                ? `${missing} \`loginctl can-hibernate\` antwortet nicht mit „yes“ (oft fehlt ein Swap, so groß wie der Arbeitsspeicher, oder die Resume-Einstellung). Mit der Option \`shutdownMode\` „sleep“ oder „shutdown“ wählen.`
                : `${missing} Unter macOS ist der Ruhezustand eine Einstellung von pmset (hibernatemode), kein Befehl. Mit der Option \`shutdownMode\` „sleep“ oder „shutdown“ wählen.`
            : r.reason === 'no-sleep'
              ? r.os === 'windows'
                ? `${missing} \`powercfg /a\` nennt keinen verfügbaren Standby-Modus (S3 oder S0). Mit der Option \`shutdownMode\` „shutdown“ wählen.`
                : `${missing} \`loginctl can-suspend\` antwortet nicht mit „yes“ (oder pmset fehlt). Mit der Option \`shutdownMode\` „shutdown“ wählen.`
              : r.os === 'linux'
                ? `${missing} Deine Sitzung darf diesen Linux-Rechner nicht ohne Rückfrage ausschalten. Entweder antwortet \`loginctl can-power-off\` mit „yes“ (bei einer lokalen Desktop-Anmeldung meist so), oder sudo erlaubt \`shutdown\` ohne Passwort: \`sudo visudo -f /etc/sudoers.d/shutdown\` mit der Zeile \`DEIN_NAME ALL=(root) NOPASSWD: PFAD\` (PFAD aus \`command -v shutdown\`). Danach eine neue Sitzung öffnen.`
                : r.os === 'macos'
                  ? `${missing} macOS fährt ohne Rückfrage nur mit sudo herunter. Einmal einrichten: \`sudo visudo -f /etc/sudoers.d/shutdown\` mit der Zeile \`DEIN_NAME ALL=(root) NOPASSWD: /sbin/shutdown\`. Danach eine neue Sitzung öffnen.`
                  : r.reason === 'check-failed'
                    ? `${missing} Die Prüfung der Voraussetzungen ließ sich nicht ausführen. Eine neue Sitzung prüft erneut.`
                    : `${missing} Das Betriebssystem wurde nicht erkannt (Windows, Linux und macOS werden unterstützt).`,
      shutdownLog:
        mode === 'shutdown'
          ? '⏻ Shutdown: Die Sitzung ist pausiert, der Rechner fährt jetzt herunter.'
          : `⏾ ${w.label}: Die Sitzung ist pausiert, der Rechner ${w.now}. Danach bleibt sie pausiert, bis du „Weiter“ drückst.`,
      shutdownNotifyTitle: seconds => `${w.label} in ${span(seconds)}`,
      shutdownNotifyBody: folder =>
        `${folder === null ? 'Die Sitzung' : `Die Sitzung in ${folder}`} ist pausiert, der Rechner ${w.soon}. Abbrechen in der Leiste über dem Eingabefeld.`,
      waitingFor: folders =>
        folders.length === 0
          ? `${w.label}: sieht nach den anderen Sitzungen …`
          : `${w.label} wartet auf ${folders.length === 1 ? '1 Sitzung' : `${folders.length} Sitzungen`}: ${folders.join(', ')}`,
    }
  }
  const missing = `${w.label} is not available:`
  return {
    shutdown: w.label,
    shutdownRequested: `Preparing ${mode === 'shutdown' ? 'the shutdown' : mode === 'sleep' ? 'sleep' : 'hibernation'} …`,
    shutdownIn: seconds => `${w.label} in ${clock(seconds)}`,
    shutdownRunning: w.running,
    shutdownCancelled: `${w.label} cancelled. The pause stays as it is.`,
    shutdownFailed: error => `${w.label} failed: ${error}`,
    shutdownChecking: `${w.label}: checking what it needs …`,
    shutdownHelp: r =>
      r.reason === 'no-right'
        ? `${missing} your Windows account lacks the right "Shut down the system" (SeShutdownPrivilege). An administrator grants it under Local Security Policy → Local Policies → User Rights Assignment → "Shut down the system". Then open a new session.`
        : r.reason === 'no-hibernate'
          ? r.os === 'windows'
            ? `${missing} Windows has hibernation turned off. Turn it on in a command prompt run as administrator with \`powercfg /hibernate on\`, then open a new session; or choose "sleep" or "shutdown" with the option \`shutdownMode\`.`
            : r.os === 'linux'
              ? `${missing} \`loginctl can-hibernate\` does not answer "yes" (often there is no swap as large as the memory, or no resume setting). Choose "sleep" or "shutdown" with the option \`shutdownMode\`.`
              : `${missing} on macOS hibernation is a setting of pmset (hibernatemode), not a command. Choose "sleep" or "shutdown" with the option \`shutdownMode\`.`
          : r.reason === 'no-sleep'
            ? r.os === 'windows'
              ? `${missing} \`powercfg /a\` lists no standby state as available (S3 or S0). Choose "shutdown" with the option \`shutdownMode\`.`
              : `${missing} \`loginctl can-suspend\` does not answer "yes" (or pmset is missing). Choose "shutdown" with the option \`shutdownMode\`.`
            : r.os === 'linux'
              ? `${missing} your session may not power this Linux machine off without being asked. Either \`loginctl can-power-off\` answers "yes" (usually so for a local desktop login), or sudo allows \`shutdown\` without a password: \`sudo visudo -f /etc/sudoers.d/shutdown\` with the line \`YOUR_NAME ALL=(root) NOPASSWD: PATH\` (PATH from \`command -v shutdown\`). Then open a new session.`
              : r.os === 'macos'
                ? `${missing} macOS shuts down without being asked only through sudo. Set it up once: \`sudo visudo -f /etc/sudoers.d/shutdown\` with the line \`YOUR_NAME ALL=(root) NOPASSWD: /sbin/shutdown\`. Then open a new session.`
                : r.reason === 'check-failed'
                  ? `${missing} the check of what it needs could not run. A new session checks again.`
                  : `${missing} the operating system was not recognised (Windows, Linux and macOS are supported).`,
    shutdownLog:
      mode === 'shutdown'
        ? '⏻ Shutdown: the session is paused, the computer shuts down now.'
        : `⏾ ${w.label}: the session is paused, and the computer ${w.now}. It stays paused until you press "Resume".`,
    shutdownNotifyTitle: seconds => `${w.label} in ${span(seconds)}`,
    shutdownNotifyBody: folder =>
      `${folder === null ? 'The session' : `The session in ${folder}`} is paused, and the computer ${w.soon}. Cancel in the band above the prompt.`,
    waitingFor: folders =>
      folders.length === 0
        ? `${w.label}: looking at the other sessions …`
        : `${w.label} waits for ${folders.length === 1 ? '1 session' : `${folders.length} sessions`}: ${folders.join(', ')}`,
  }
}

export function strings(lang: Lang, mode: ShutdownMode = 'shutdown'): Strings {
  return { ...(lang === 'de' ? DE : EN), ...modeTexts(lang, mode) }
}
