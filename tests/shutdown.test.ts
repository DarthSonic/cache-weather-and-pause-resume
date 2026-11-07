import { describe, expect, test } from 'claude-code/testing'

import { hasShutdownRight, logindAllows, osFromUname, secondsLeft, shutdownCommand, windowsSystem32 } from '../hooks/shutdown'

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
