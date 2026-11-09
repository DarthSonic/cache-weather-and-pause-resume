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
  /**
   * The readings spelled out in the desktop app, where they have a row of their own (0.10.0): the cache time left, the
   * hit rate, the context against the auto-compact threshold (an assumed one „ca.“), keep-warm's switch and its count.
   * A terminal keeps the short forms.
   */
  cacheLeft: (minutes: number) => string
  hits: (percent: number) => string
  context: (fill: string, threshold: number, isAssumed: boolean) => string
  keepWarmSwitch: string
  keepWarmRefreshes: (n: number) => string
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
  /** The sessions overview (0.10.0): its button, the pane's title, and the words it describes a session with. */
  sessions: string
  sessionsTitle: string
  sessionsNone: string
  thisSession: string
  sessionState: (state: 'paused' | 'pausing' | 'awaiting' | 'working' | 'idle', minutes: number | null) => string
  sessionCache: (minutesLeft: number | null) => string
  sessionKeepWarm: (isOn: boolean) => string
  sessionRuns: (runs: readonly string[]) => string
  /** A model switch that forfeits a warm cache: the new model, the tokens to write, Claude Code's estimate. */
  modelSwitchLog: (to: string, tokens: string, usd: number, pricing: string) => string
  /** About how many turns until auto-compact, as the status row says it. */
  compactForecast: (turns: number) => string
  /** Keep-warm's balance once the person is back: refreshes, their cost, the rebuild spared, the share saved. */
  keepWarmBalanceLog: (refreshes: number, tokens: string, savedPercent: number) => string
  /** What keep-warm would have saved, where it was off and the cache lapsed (0.10.1). */
  keepWarmWouldHaveLog: (percent: number, tokens: string, refreshes: number) => string
  /** What the refreshes cost where the cache was not used again. */
  keepWarmWastedLog: (refreshes: number, spent: string) => string
  keepWarmLimitLog: (window: string, percent: number) => string
  /** A usage window as the status row shows it: its name, how full, when it starts over. */
  usageWindow: (kind: string) => string
  usageLine: (window: string, percent: number, reset: string | null) => string
  keepWarmRefreshedLog: (read: string, out: string, saving: { percent: number; tokens: string } | null) => string
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
  cacheLeft: m => `Cache noch ${m} min`,
  hits: p => `Treffer ${p} %`,
  context: (fill, threshold, isAssumed) => `Kontext ${fill} · Auto-Compact bei ${isAssumed ? 'ca. ' : ''}${threshold} %`,
  keepWarmSwitch: 'Cache warm halten',
  keepWarmRefreshes: n => `(${n}× aufgefrischt)`,
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
  compactForecast: n => (n <= 1 ? 'Auto-Compact wohl beim nächsten Zug' : `Auto-Compact in ≈ ${n} Zügen`),
  sessions: 'Sitzungen',
  sessionsTitle: 'Sitzungen',
  sessionsNone: 'Noch keine Sitzung hat sich gemeldet; jede mit dem Mod meldet sich alle 15 Sekunden.',
  thisSession: 'diese Sitzung',
  sessionState: (state, m) =>
    state === 'paused'
      ? `pausiert${m === null ? '' : ` seit ${duration(m)}`}`
      : state === 'pausing'
        ? 'Pause wird vorbereitet'
        : state === 'awaiting'
          ? 'wartet auf eine Freigabe oder Antwort'
          : state === 'working'
            ? `arbeitet${m === null ? '' : ` seit ${duration(m)}`}`
            : 'untätig',
  sessionCache: m => (m === null ? 'Cache ?' : m <= 0 ? 'Cache abgelaufen' : `Cache ${m} m`),
  sessionKeepWarm: isOn => (isOn ? 'Keep-warm an' : 'Keep-warm aus'),
  sessionRuns: runs => `${runs.length === 1 ? 'Lauf' : 'Läufe'}: ${runs.join(', ')}`,
  modelSwitchLog: (to, tokens, usd, pricing) =>
    `Modellwechsel auf ${to}: Der warme Cache des bisherigen Modells verfällt, die nächste Anfrage schreibt ${tokens} Tokens neu in den Cache, ≈ ${usd.toFixed(2).replace('.', ',')} $ (${pricing === 'configured' ? 'nach eurem eingestellten Preis' : pricing === 'catalog' ? 'Listenpreis' : 'geschätzt, Modell unbekannt'}).`,
  keepWarmBalanceLog: (n, tokens, saved) =>
    saved >= 0
      ? `↻ Keep-warm hat ≈ ${saved} % gespart (≈ ${tokens} Input-Tokens): ${n === 1 ? '1 Auffrischung' : `${n} Auffrischungen`} statt Neuaufbau des Caches.`
      : `↻ Keep-warm-Bilanz: Diesmal hat Keep-warm nichts gespart: ${n === 1 ? '1 Auffrischung kostete' : `${n} Auffrischungen kosteten`} ≈ ${-saved} % mehr als ein Neuaufbau des Caches.`,
  keepWarmWouldHaveLog: (percent, tokens, n) =>
    `Keep-warm hätte hier ≈ ${percent} % gespart (≈ ${tokens} Input-Tokens): Der Cache war abgelaufen und wurde neu geschrieben; ${n === 1 ? '1 Auffrischung hätte' : `${n} Auffrischungen hätten`} ihn warm gehalten.`,
  keepWarmWastedLog: (n, spent) =>
    `Keep-warm-Bilanz: ${n === 1 ? '1 Auffrischung kostete' : `${n} Auffrischungen kosteten`} so viel wie ${spent} Input-Tokens, ohne dass der Cache noch gebraucht wurde.`,
  keepWarmLimitLog: (window, percent) =>
    `Keep-warm: hält an, weil das ${window} bei ${percent} % steht. Eine Auffrischung würde den Rest verbrauchen. Ist das Fenster zurückgesetzt, frischt Keep-warm wieder auf.`,
  usageWindow: kind =>
    kind === 'five_hour' ? '5-h-Limit' : kind === 'seven_day' ? '7-Tage-Limit' : kind === 'spend_limit' ? 'Ausgabenlimit' : kind,
  usageLine: (window, percent, reset) => `${window} ${percent} %${reset === null ? '' : ` · neu ${reset.includes(' ') ? '' : 'um '}${reset}`}`,
  keepWarmRefreshedLog: (read, out, saving) =>
    `↻ Keep-warm: Cache aufgefrischt (${read} Tokens aus dem Cache gelesen, ${out} Tokens Antwort)${saving === null ? '' : `; Weitermachen spart jetzt ≈ ${saving.percent} % (≈ ${saving.tokens} Input-Tokens)`}`,
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
  cacheLeft: m => `Cache ${m} min left`,
  hits: p => `Hits ${p} %`,
  context: (fill, threshold, isAssumed) => `Context ${fill} · auto-compact at ${isAssumed ? 'about ' : ''}${threshold} %`,
  keepWarmSwitch: 'Keep cache warm',
  keepWarmRefreshes: n => `(refreshed ${n}×)`,
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
  compactForecast: n => (n <= 1 ? 'Auto-compact likely at the next turn' : `Auto-compact in about ${n} turns`),
  sessions: 'Sessions',
  sessionsTitle: 'Sessions',
  sessionsNone: 'No session has reported yet; each one with the mod reports every 15 seconds.',
  thisSession: 'this session',
  sessionState: (state, m) =>
    state === 'paused'
      ? `paused${m === null ? '' : ` for ${duration(m)}`}`
      : state === 'pausing'
        ? 'preparing the pause'
        : state === 'awaiting'
          ? 'waits for an approval or answer'
          : state === 'working'
            ? `working${m === null ? '' : ` for ${duration(m)}`}`
            : 'idle',
  sessionCache: m => (m === null ? 'Cache ?' : m <= 0 ? 'Cache expired' : `Cache ${m} m`),
  sessionKeepWarm: isOn => (isOn ? 'Keep-warm on' : 'Keep-warm off'),
  sessionRuns: runs => `${runs.length === 1 ? 'Run' : 'Runs'}: ${runs.join(', ')}`,
  modelSwitchLog: (to, tokens, usd, pricing) =>
    `Model switched to ${to}: the warm cache of the model before is forfeited, and the next request writes ${tokens} tokens to the cache again, ≈ $${usd.toFixed(2)} (${pricing === 'configured' ? 'at your configured price' : pricing === 'catalog' ? 'list price' : 'estimated, model unknown'}).`,
  keepWarmBalanceLog: (n, tokens, saved) =>
    saved >= 0
      ? `↻ Keep-warm saved ≈ ${saved} % (≈ ${tokens} input tokens' worth): ${n === 1 ? '1 refresh' : `${n} refreshes`} instead of rebuilding the cache.`
      : `↻ Keep-warm balance: this time keep-warm saved nothing: ${n === 1 ? '1 refresh cost' : `${n} refreshes cost`} ≈ ${-saved} % more than rebuilding the cache.`,
  keepWarmWouldHaveLog: (percent, tokens, n) =>
    `Keep-warm would have saved ≈ ${percent} % here (≈ ${tokens} input tokens' worth): the cache had expired and was written again; ${n === 1 ? '1 refresh' : `${n} refreshes`} would have kept it warm.`,
  keepWarmWastedLog: (n, spent) =>
    `Keep-warm balance: ${n === 1 ? '1 refresh cost' : `${n} refreshes cost`} as much as ${spent} input tokens, and the cache was not used again.`,
  keepWarmLimitLog: (window, percent) =>
    `Keep-warm: stopped because the ${window} stands at ${percent} %. A refresh would spend the rest of it. Once the window starts over, keep-warm refreshes again.`,
  usageWindow: kind =>
    kind === 'five_hour' ? '5-hour limit' : kind === 'seven_day' ? '7-day limit' : kind === 'spend_limit' ? 'Spend limit' : kind,
  usageLine: (window, percent, reset) => `${window} ${percent} %${reset === null ? '' : ` · resets ${reset.includes(' ') ? '' : 'at '}${reset}`}`,
  keepWarmRefreshedLog: (read, out, saving) =>
    `↻ Keep-warm: cache refreshed (${read} tokens read from the cache, ${out} tokens of reply)${saving === null ? '' : `; continuing now saves ≈ ${saving.percent} % (≈ ${saving.tokens} input tokens' worth)`}`,
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
