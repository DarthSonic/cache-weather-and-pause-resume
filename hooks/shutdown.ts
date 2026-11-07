// The shutdown button's pure parts: which system the session runs on, whether it can be shut down with nobody at the
// keyboard, and the command that does it. No `$` here, so the tests call them directly.

import type { ShutdownOs } from '../types'

/** How long the band counts down once the session is paused, before the command runs. */
export const SHUTDOWN_COUNTDOWN_MS = 60_000

// What the Windows shutdown log records as the reason.
const SHUTDOWN_COMMENT = 'cache-weather-and-pause-resume: the session is paused, shut down from the band'

/**
 * The command per system. Windows: closing the other programs is forced (`/f`; any time-out implies it) so that no
 * „apps are preventing shutdown“ screen waits for someone who left, after ten seconds of Windows' own notice. Linux:
 * systemd-logind's poweroff where the session may, else sudo without a password. macOS: sudo without a password.
 */
export function shutdownCommand(os: ShutdownOs, viaLogind: boolean): readonly string[] {
  if (os === 'windows') return ['shutdown', '/s', '/f', '/t', '10', '/d', 'p:0:0', '/c', SHUTDOWN_COMMENT]
  if (os === 'linux' && viaLogind) return ['systemctl', 'poweroff']
  return ['sudo', '-n', 'shutdown', '-h', 'now']
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
