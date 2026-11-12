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
  isPowerCommand,
  planTime,
  PLAN_MAX_AHEAD_MS,
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

// ── A shutdown planned for a time (0.11.0) ──────────────────────────────────────────────────────────────────────────

describe('a planned shutdown', () => {
  test('falls at "HH:MM" the next time it comes, or in so many minutes, at most a day ahead', async () => {
    const now = new Date(2026, 10, 11, 22, 57, 0, 0).getTime()
    // Later today, and tomorrow for a time already past (local time, so the test holds in any time zone).
    expect(planTime({ at: '23:30' }, now)).toBe(new Date(2026, 10, 11, 23, 30, 0, 0).getTime())
    expect(planTime({ at: '02:30' }, now)).toBe(new Date(2026, 10, 12, 2, 30, 0, 0).getTime())
    expect(planTime({ at: '2.30 Uhr' }, now)).toBe(new Date(2026, 10, 12, 2, 30, 0, 0).getTime())
    expect(planTime({ inMinutes: 150 }, now)).toBe(now + 150 * 60_000)
    expect(planTime({ inMinutes: PLAN_MAX_AHEAD_MS / 60_000 + 1 }, now)).toBeNull()
    expect(planTime({ at: '25:00' }, now)).toBeNull()
    expect(planTime({ at: 'halb drei' }, now)).toBeNull()
    expect(planTime({}, now)).toBeNull()
  })

  test('a power command in command position counts; a word in quotes, a here-document or a restart does not', async () => {
    // What the Traumfabrik session ran on 2026-11-11 to shut the computer down at 02:30, word for word.
    expect(
      isPowerCommand(
        '$target = Get-Date -Year 2026 -Month 11 -Day 12 -Hour 2 -Minute 30 -Second 0; $secs = [int][math]::Floor(($target - (Get-Date)).TotalSeconds); shutdown /s /t $secs /c "Geplantes Herunterfahren um 02:30 (Wunsch des Nutzers). Abbrechen: shutdown /a"; "exit $LASTEXITCODE"',
      ),
    ).toBe(true)
    for (const command of [
      'shutdown /s /t 0',
      'C:\\Windows\\System32\\shutdown.exe /p',
      'shutdown /h',
      'Stop-Computer -Force',
      'sudo shutdown -h now',
      'sudo -n shutdown -h now',
      'shutdown now',
      'shutdown +30',
      'systemctl suspend',
      'loginctl hibernate',
      'pmset sleepnow',
      'poweroff',
      'cmd /c shutdown /s /t 60',
      'Start-Process shutdown -ArgumentList "/s /t 60"',
      'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
      'echo done && shutdown /s /t 5',
      '& "C:\\Windows\\System32\\shutdown.exe" /s /t 0',
      'powershell -NoProfile -Command "shutdown /s /t 0"',
      "bash -c 'sudo shutdown -h now'",
    ]) {
      expect([command, isPowerCommand(command)]).toEqual([command, true])
    }
    for (const command of [
      'shutdown /a',
      'shutdown /r /t 0',
      'sudo shutdown -r now',
      'shutdown -c',
      'grep -n "shutdown /s" hooks/register.tsx',
      "grep -rn 'pmset sleepnow' .",
      'echo shutdown /s',
      'git commit -m "Release 0.11.0: shutdown /s at a time; pmset sleepnow"',
      "cat <<'EOF' > notes.md\nshutdown /s /t 0\npoweroff\nEOF",
      "$text = @'\nshutdown /s\n'@",
      'Get-Process | Where-Object Name -eq shutdown',
      'npm run shutdown-server',
      'systemctl status sleep.target',
      'shutdown "x"',
      'npm run "shutdown"',
      'powershell -Command "Get-Date"',
      "bash -c 'echo shutdown /s'",
    ]) {
      expect([command, isPowerCommand(command)]).toEqual([command, false])
    }
  })
})
