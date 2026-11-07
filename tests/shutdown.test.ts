import { describe, expect, test } from 'claude-code/testing'

import { hasShutdownRight, logindAllows, osFromUname, secondsLeft, shutdownCommand } from '../hooks/shutdown'

describe('the shutdown command', () => {
  test('Windows forces the other programs closed after its own ten seconds; Linux uses logind or sudo; macOS sudo', async () => {
    const win = shutdownCommand('windows', false)
    expect(win.slice(0, 5)).toEqual(['shutdown', '/s', '/f', '/t', '10'])
    expect(shutdownCommand('linux', true)).toEqual(['systemctl', 'poweroff'])
    expect(shutdownCommand('linux', false)).toEqual(['sudo', '-n', 'shutdown', '-h', 'now'])
    expect(shutdownCommand('macos', false)).toEqual(['sudo', '-n', 'shutdown', '-h', 'now'])
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
