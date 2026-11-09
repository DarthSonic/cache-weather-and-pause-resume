import { describe, expect, test } from 'claude-code/testing'

import {
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
} from '../hooks/shutdown'

// `powercfg /a` on a German Windows with standby (S3) and hibernation turned off, as it answered on 2026-11-09.
const POWERCFG_DE = [
  'Die folgenden Standbymodusfunktionen sind auf diesem System verfügbar:',
  '    Standby (S3)',
  '',
  'Die folgenden Standbymodusfunktionen sind auf diesem System nicht verfügbar:',
  '    Standby (S1)',
  '\tDie Systemfirmware unterstützt diesen Standbystatus nicht.',
  '',
  '    Ruhezustand',
  '\tRuhezustand wurde nicht aktiviert.',
  '',
].join('\r\n')
// One where no standby is available: S3 is listed with the reason it is not.
const POWERCFG_NONE = [
  'The following sleep states are not available on this system:',
  '    Standby (S3)',
  '\tThe system firmware does not support this standby state.',
  '',
  '    Standby (S0 Low Power Idle)',
  '\tThe system firmware does not support this standby state.',
  '',
].join('\r\n')

describe('standby and hibernation (0.9.5)', () => {
  test('an answer counts only for the mode it was checked for; one from before 0.9.5 was for shutting down', async () => {
    expect(readinessFits({ mode: 'sleep' }, 'sleep')).toBe(true)
    expect(readinessFits({ mode: 'shutdown' }, 'hibernate')).toBe(false)
    expect(readinessFits({}, 'shutdown')).toBe(true)
    expect(readinessFits({}, 'hibernate')).toBe(false)
    expect(readinessFits(null, 'shutdown')).toBe(false)
  })

  test('the option picks the mode; anything else shuts down', async () => {
    expect(modeOf('sleep')).toBe('sleep')
    expect(modeOf('hibernate')).toBe('hibernate')
    expect(modeOf('off')).toBe('shutdown')
    expect(modeOf(undefined)).toBe('shutdown')
  })

  test('the commands per system, each program by its full path', async () => {
    const ps = windowsPowerShell('C:\\Windows\\System32')
    expect(ps).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    const sleep = sleepCommand('windows', ps)
    expect(sleep.slice(0, 4)).toEqual([ps, '-NoProfile', '-NonInteractive', '-Command'])
    expect(sleep[4]).toContain("SetSuspendState('Suspend', $false, $false)")
    expect(sleepCommand('linux', '/usr/bin/systemctl')).toEqual(['/usr/bin/systemctl', 'suspend'])
    expect(sleepCommand('macos', '/usr/bin/pmset')).toEqual(['/usr/bin/pmset', 'sleepnow'])
    expect(hibernateCommand('windows', 'C:\\Windows\\System32\\shutdown.exe')).toEqual(['C:\\Windows\\System32\\shutdown.exe', '/h'])
    expect(hibernateCommand('linux', '/usr/bin/systemctl')).toEqual(['/usr/bin/systemctl', 'hibernate'])
  })

  test('hibernation is read off the registry value, standby off the shape of powercfg’s answer', async () => {
    const reg = (value: string) => `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\r\n    HibernateEnabled    REG_DWORD    ${value}\r\n`
    expect(hibernateEnabled(reg('0x1'))).toBe(true)
    expect(hibernateEnabled(reg('0x0'))).toBe(false)
    expect(hibernateEnabled('ERROR: The system was unable to find the specified registry key or value.')).toBe(false)
    expect(standbyAvailable(POWERCFG_DE)).toBe(true)
    expect(standbyAvailable(POWERCFG_NONE)).toBe(false)
  })
})

describe('the shutdown command', () => {
  test('Windows forces the other programs closed after its own ten seconds; Linux uses logind or sudo; macOS sudo', async () => {
    const win = shutdownCommand('windows', false, 'C:\\Windows\\System32\\shutdown.exe')
    expect(win.slice(0, 5)).toEqual(['C:\\Windows\\System32\\shutdown.exe', '/s', '/f', '/t', '10'])
    expect(shutdownCommand('linux', true, '/usr/bin/systemctl')).toEqual(['/usr/bin/systemctl', 'poweroff'])
    expect(shutdownCommand('linux', false, '/usr/bin/sudo')).toEqual(['/usr/bin/sudo', '-n', 'shutdown', '-h', 'now'])
    expect(shutdownCommand('macos', false, '/usr/bin/sudo')).toEqual(['/usr/bin/sudo', '-n', 'shutdown', '-h', 'now'])
  })

  test('Windows programs come from its own folder, never from a name looked up elsewhere', async () => {
    expect(windowsSystem32('C:\\Windows')).toBe('C:\\Windows\\System32')
    expect(windowsSystem32('D:\\WINNT\\')).toBe('D:\\WINNT\\System32')
    expect(windowsSystem32(undefined)).toBe('C:\\Windows\\System32')
    expect(windowsSystem32('.\\evil')).toBe('C:\\Windows\\System32')
    expect(windowsSystem32('C:\\Users\\x\\repo')).toBe('C:\\Windows\\System32')
  })

  test('reads the system, the Windows right and logind’s answer', async () => {
    expect(osFromUname('Linux\n')).toBe('linux')
    expect(osFromUname('Darwin')).toBe('macos')
    expect(osFromUname('FreeBSD')).toBeNull()
    expect(hasShutdownRight('SeShutdownPrivilege   Shut down the system   Disabled')).toBe(true)
    expect(hasShutdownRight('SeChangeNotifyPrivilege   Bypass traverse checking   Enabled')).toBe(false)
    expect(logindAllows('yes\n')).toBe(true)
    expect(logindAllows('challenge')).toBe(false)
    expect(secondsLeft(60_000, 1_000)).toBe(59)
    expect(secondsLeft(60_000, 59_500)).toBe(1)
    expect(secondsLeft(60_000, 61_000)).toBe(0)
  })
})
