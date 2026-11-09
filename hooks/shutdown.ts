// The shutdown button's pure parts: which system the session runs on, whether it can be shut down with nobody at the
// keyboard, and the command that does it. No `$` here, so the tests call them directly.

import type { ShutdownMode, ShutdownOs } from '../types'

/** How long the band counts down once the session is paused, before the command runs. */
export const SHUTDOWN_COUNTDOWN_MS = 300_000

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
