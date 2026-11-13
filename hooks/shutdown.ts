// The shutdown button's pure parts: which system the session runs on, whether it can be shut down with nobody at the
// keyboard, and the command that does it. No `$` here, so the tests call them directly.

import type { ShutdownMode, ShutdownOs } from '../types'

/** How long the band counts down once the session is paused, before the command runs. */
export const SHUTDOWN_COUNTDOWN_MS = 300_000

// ── A shutdown planned for a time (0.11.0) ──────────────────────────────────────────────────────────────────────────

/** Once every session is paused after the planned time, this little is left before the command: the person is away. */
export const SCHEDULED_COUNTDOWN_MS = 60_000
/** A computer still running this long after the shutdown command did not shut down: cancelled (shutdown /a) or held
 * up. The band leaves "shutting down" then; the pause stays (0.11.0, live). */
export const SHUTDOWN_STUCK_MS = 120_000
/** Sessions at work are reminded this long before the time (the person's choice, 2026-11-12). */
export const PLAN_REMINDER_MS = 30 * 60_000
/** A plan whose time passed this long ago with no session to fire it lapses: the computer was off or asleep. */
export const PLAN_GRACE_MS = 10 * 60_000
/** From this long before a plan's time until a while after it fired, every session looks every second (0.11.0). */
export const PLAN_NEAR_MS = 60_000
export const PLAN_FOLLOW_MS = 3 * 60_000
/** At most this far ahead. */
export const PLAN_MAX_AHEAD_MS = 24 * 60 * 60_000

/**
 * When a plan falls: in so many minutes, or at "HH:MM" (24 hours, local time) the next time that comes; null where it
 * reads as neither or lies more than a day ahead.
 */
export function planTime(s: { at?: unknown; inMinutes?: unknown }, now: number): number | null {
  if (typeof s.inMinutes === 'number' && Number.isFinite(s.inMinutes) && s.inMinutes > 0) {
    const ms = Math.round(s.inMinutes * 60_000)
    // On the next full minute: "in 4 minutes" at 00:23:50 is 00:28:00, a time the person reads at a glance.
    return ms <= PLAN_MAX_AHEAD_MS ? Math.ceil((now + ms) / 60_000) * 60_000 : null
  }
  if (typeof s.at !== 'string') return null
  const found = /^\s*(\d{1,2})[:.](\d{2})\s*(?:uhr|h)?\s*$/i.exec(s.at)
  if (found === null) return null
  const hours = Number(found[1])
  const minutes = Number(found[2])
  if (hours > 23 || minutes > 59) return null
  const day = new Date(now)
  day.setHours(hours, minutes, 0, 0)
  // Past already today: tomorrow (setDate keeps the wall-clock time across a change of daylight saving).
  if (day.getTime() <= now) day.setDate(day.getDate() + 1)
  return day.getTime()
}

// Text no shell runs as a command: here-documents and PowerShell here-strings (a file written with cat <<EOF)...
function withoutDocs(command: string): string {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, ' ')
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, ' ')
}

// ... and quoted strings (a commit message, a grep pattern that names `shutdown /s`).
function withoutData(command: string): string {
  return withoutDocs(command)
    .replace(/"(?:[^"\\`]|\\.|`.)*"/g, '""')
    .replace(/'[^']*'/g, "''")
}

// A shell started with a command of its own (`powershell -Command "..."`, `bash -c '...'`): that command counts too.
const NESTED = /(?:^|[;&|\n(]\s*)(?:powershell|pwsh)(?:\.exe)?\b[^"'\n]*?\s-(?:Command|c)\s+(["'])([\s\S]*?)\1|(?:^|[;&|\n(]\s*)(?:bash|sh|zsh)\s+-c\s+(["'])([\s\S]*?)\3/gi
// A program named by its quoted full path, called (`& "C:\Windows\System32\shutdown.exe" /s`).
const QUOTED_SHUTDOWN = /(?:^|[;|\n(]\s*|&\s*)["'][^"'\n]*[\\/]shutdown(?:\.exe)?["']\s+(?:[^;&|\n]*\s)?[/-][sSpPhH]\b/i

/**
 * Whether a shell command shuts the computer down, puts it to sleep or hibernates it (0.11.0): a power program in the
 * position of a command (at the start, after `;`, `&&`, `|`, a line break or sudo), never a word inside quotes, a
 * here-document or the arguments of another program. `shutdown /a`, `-c` and restarts (`/r`, `/g`, `-r`) are none.
 */
export function isPowerCommand(command: string): boolean {
  const docless = withoutDocs(command)
  if (QUOTED_SHUTDOWN.test(docless)) return true
  for (const nested of docless.matchAll(NESTED)) {
    const inner = nested[2] ?? nested[4]
    if (inner !== undefined && isPowerCommand(inner)) return true
  }
  for (const raw of withoutData(command).split(/[;&|\n(){}]/)) {
    const part = raw
      .trim()
      .replace(/^(?:sudo|doas)\s+(?:-\S+\s+)*/, '')
      .replace(/^cmd(?:\.exe)?\s+\/[ck]\s+/i, '')
    if (part === '') continue
    if (/^Stop-Computer\b/i.test(part)) return true
    if (/^(?:poweroff|halt)(?:\s|$)/.test(part)) return true
    if (/^(?:systemctl|loginctl)\s+(?:poweroff|halt|suspend|hibernate|hybrid-sleep|suspend-then-hibernate)\b/.test(part)) return true
    if (/^pmset\s+sleepnow\b/.test(part)) return true
    if (/^rundll32(?:\.exe)?\s+powrprof\.dll\s*,\s*SetSuspendState/i.test(part)) return true
    if (/^\[[^\]]*Application\]::SetSuspendState\s*\(/i.test(part)) return true
    const program = /^(Start-Process\s+)?(?:[A-Za-z]:)?(?:[\w.-]*[\\/])*shutdown(?:\.exe)?(?:\s+-ArgumentList)?(\s.*)?$/i.exec(part)
    if (program === null) continue
    const args = ` ${program[2] ?? ''} `
    if (/\s\/[arg]\b|\s-[arc]\b|\s--(?:reboot|cancel)\b/i.test(args)) continue
    if (/\s[/-][sSpPhH]\b|\s--(?:poweroff|halt)\b|\snow\b|\s\+\d+\b|\s\d{1,2}:\d{2}\b/.test(args)) return true
    // Start-Process with its arguments in quotes, which are gone here: its own quoted arguments decide.
    if (program[1] !== undefined && /Start-Process\s+["']?shutdown(?:\.exe)?["']?\s+-ArgumentList\s+["'][^"']*[/-][sSpPhH]\b/i.test(docless)) return true
  }
  return false
}

// What the Windows shutdown log records as the reason.
const SHUTDOWN_COMMENT = 'cache-weather-and-pause-resume: the session is paused, shut down from the band'

// Every program runs by its full path in the system's own folders, never looked up by name: Windows would look in the
// session's folder first, so a repository could plant a `whoami.exe` or `shutdown.exe` there and have it run at a
// session's start. (`shutdown` after sudo is found by sudo's own secure path, not the person's.)

/** Windows' program folder, from `SystemRoot` when it names a drive's folder, else the default. */
export function windowsSystem32(systemRoot: string | undefined): string {
  const base = systemRoot !== undefined && /^[A-Za-z]:\\[^\\/:*?"<>|]+$/.test(systemRoot.replace(/[\\/]+$/, ''))
    ? systemRoot.replace(/[\\/]+$/, '')
    : 'C:\\Windows'
  return `${base}\\System32`
}

/** Where a Unix system keeps each program the button runs; the first that exists is taken. */
export const UNIX_PROGRAMS = {
  uname: ['/usr/bin/uname', '/bin/uname'],
  loginctl: ['/usr/bin/loginctl', '/bin/loginctl'],
  systemctl: ['/usr/bin/systemctl', '/bin/systemctl'],
  sudo: ['/usr/bin/sudo', '/bin/sudo'],
  pmset: ['/usr/bin/pmset'],
} as const

/** The option `shutdownMode`: shut down (the default), sleep (standby) or hibernate (0.9.5). */
export function modeOf(option: unknown): ShutdownMode {
  return option === 'sleep' || option === 'hibernate' ? option : 'shutdown'
}

/**
 * Whether a check's answer holds for the mode now chosen. The option can change while the session runs (the mod is
 * loaded anew, the session's state stays): an answer for another mode must not run its command (0.9.5).
 */
export function readinessFits(readiness: { mode?: ShutdownMode } | null, mode: ShutdownMode): boolean {
  return readiness !== null && (readiness.mode ?? 'shutdown') === mode
}

/** Windows PowerShell in Windows' own folder: the one way Windows offers to go to standby. */
export function windowsPowerShell(system32: string): string {
  return `${system32}\\WindowsPowerShell\\v1.0\\powershell.exe`
}

// Standby through the system's own call, fixed text: no profile, nothing typed in, nothing of the person's.
const SLEEP_SCRIPT =
  "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"

/** Standby: Windows through PowerShell, Linux through systemd-logind, macOS through pmset. */
export function sleepCommand(os: ShutdownOs, program: string): readonly string[] {
  if (os === 'windows') return [program, '-NoProfile', '-NonInteractive', '-Command', SLEEP_SCRIPT]
  if (os === 'linux') return [program, 'suspend']
  return [program, 'sleepnow']
}

/** Hibernation: Windows' shutdown.exe, Linux through systemd-logind (macOS offers none of its own to call). */
export function hibernateCommand(os: ShutdownOs, program: string): readonly string[] {
  return os === 'windows' ? [program, '/h'] : [program, 'hibernate']
}

/** Whether `reg query …\Control\Power /v HibernateEnabled` reads 1: words of no language, only the value. */
export function hibernateEnabled(regOutput: string): boolean {
  return /HibernateEnabled\s+REG_DWORD\s+0x0*1\s*$/im.test(regOutput)
}

/**
 * Whether `powercfg /a` lists a standby state (S3, or S0 low power idle) as available. Its words follow the system's
 * language; its shape does not: each state it lists as not available is followed by a line, indented with a tab, that
 * says why. A state line with no such line under it is available.
 */
export function standbyAvailable(powercfgOutput: string): boolean {
  const lines = powercfgOutput.split(/\r?\n/)
  return lines.some((line, i) => /^ +\S/.test(line) && /\(S[03]/.test(line) && !/^\t/.test(lines[i + 1] ?? ''))
}

/**
 * The command per system, `program` the full path of the program it starts (`shutdown.exe`, `systemctl` or `sudo`).
 * Windows: closing the other programs is forced (`/f`; any time-out implies it) so that no „apps are preventing
 * shutdown“ screen waits for someone who left, after ten seconds of Windows' own notice. Linux: systemd-logind's
 * poweroff where the session may, else sudo without a password. macOS: sudo without a password.
 */
export function shutdownCommand(os: ShutdownOs, viaLogind: boolean, program: string): readonly string[] {
  if (os === 'windows') return [program, '/s', '/f', '/t', '10', '/d', 'p:0:0', '/c', SHUTDOWN_COMMENT]
  if (os === 'linux' && viaLogind) return [program, 'poweroff']
  return [program, '-n', 'shutdown', '-h', 'now']
}

/** The system from `uname -s`; null for one the button does not know. */
export function osFromUname(stdout: string): ShutdownOs | null {
  const name = stdout.trim().toLowerCase()
  if (name === 'linux') return 'linux'
  if (name === 'darwin') return 'macos'
  return null
}

/** Whether `whoami /priv` lists the right to shut the system down (enabled or not: shutdown.exe enables it). */
export function hasShutdownRight(whoamiPriv: string): boolean {
  return /\bSeShutdownPrivilege\b/.test(whoamiPriv)
}

/** Whether `loginctl can-power-off` lets this session power off without a password. */
export function logindAllows(stdout: string): boolean {
  return stdout.trim().toLowerCase() === 'yes'
}

/** Whole seconds left of the countdown, at least 0. */
export function secondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000))
}
