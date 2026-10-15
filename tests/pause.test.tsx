import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, On, PromptSubmitInput } from 'claude-code'

import { langOf, strings } from '../hooks/i18n'
import {
  formatMinutes,
  inFlight,
  isPauseCommand,
  isPersonOrigin,
  isResume,
  pauseRequest,
  pausedMachineNote,
  pausedPersonNote,
  pausingNote,
  resumeContext,
  resumeText,
  sinceText,
} from '../hooks/pause'

// The button tests read German words: the language is pinned, never the locale of the machine they run on.
const DE = { options: { language: 'de' } }
const EN = { options: { language: 'en' } }
const PAUSED_PERSON_NOTE = pausedPersonNote('de')
const PAUSED_MACHINE_NOTE = pausedMachineNote('de')
const PAUSING_NOTE = pausingNote('de')

const BAND = {
  plugin: 'cache-weather-and-pause-resume',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const OWN = { kind: 'plugin', name: 'cache-weather-and-pause-resume', asUser: true }

// What stands for the engine beneath the plugin: prompts are recorded and enter as given.
function engine(on: On): PromptSubmitInput[] {
  const prompts: PromptSubmitInput[] = []
  on('prompt.submit', ($, e) => {
    prompts.push(e)
    return { text: e.text, context: e.context }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('classic.Stop', () => ({}))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
  return prompts
}

const typed = (text: string): PromptSubmitInput => ({ text, wait: false, origin: { kind: 'composer' } })
const stop = (status?: string, session_id = 'sess-1') => ({
  stop_hook_active: false,
  session_id,
  background_tasks: status === undefined ? [] : [{ id: 'b1', type: 'shell', status, description: 'Suite' }],
})

// The user's disk as the engine reaches it: a map of files, under a home folder the environment names. The home is
// spelled as on Windows; where that is no absolute path (Linux, macOS) the engine puts the working directory in front,
// so the hooks look a path up from the home on, with forward slashes (the mod's own spelling under the home).
const HOME = 'C:\\Users\\test'
const STATE = 'C:/Users/test/.claude/cache-weather-and-pause-resume/state.json'
const fromHome = (path: string): string => {
  const at = path.indexOf(HOME)
  return (at >= 0 ? path.slice(at) : path).replaceAll('\\', '/')
}
function disk(on: On, seed: Record<string, string> = {}): Record<string, string> {
  const files: Record<string, string> = { ...seed }
  mock.env(on, { USERPROFILE: HOME })
  on('fs.exists', ($, e) => ({ value: fromHome(e.path) in files }))
  on('fs.read', ($, e) => {
    const text = files[fromHome(e.path)]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('fs.write', ($, e) => {
    files[fromHome(e.path)] = e.text
    return { value: undefined }
  })
  // A folder lists what the map holds beneath it: the next path segment, a file where nothing follows.
  on('fs.list', ($, e) => {
    const prefix = `${fromHome(e.path)}/`
    const seen = new Map<string, 'file' | 'dir'>()
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length).split('/')
      const name = rest[0] ?? ''
      seen.set(name, rest.length > 1 ? 'dir' : seen.get(name) ?? 'file')
    }
    if (seen.size === 0) throw new Error(`ENOENT: ${e.path}`)
    return { value: [...seen].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('classic.SessionStart', () => ({}))
  return files
}

const PROJECTS = 'C:/Users/test/.claude/projects'

describe('the pause words', () => {
  test('resume and pause are read off whole messages, in either language', async () => {
    for (const text of ['weitermachen', 'Weitermachen!', ' weiter ', 'fortsetzen', 'weitermachen, aber erst die Tests']) {
      expect(isResume(text)).toBe(true)
    }
    for (const text of ['continue', 'Resume.', 'go on', 'continue, but run the tests first']) expect(isResume(text)).toBe(true)
    for (const text of ['weiter so, aber pausiere', 'mach das weiter oben', 'pausieren', 'pause']) expect(isResume(text)).toBe(false)
    for (const text of ['pausieren', 'Pause', 'bitte pausieren.', 'pausiere die Sitzung', 'please pause', 'pause now']) {
      expect(isPauseCommand(text)).toBe(true)
    }
    for (const text of ['pausiere die Läufe nicht', 'mach eine Pause im Code', 'weitermachen', 'pause the music in the test']) {
      expect(isPauseCommand(text)).toBe(false)
    }
  })

  test('the request names the threshold and the four steps', async () => {
    const text = pauseRequest(5, 'de')
    expect(text).toContain('länger als 5 Minuten')
    expect(text).toContain('Restlaufzeit')
    expect(text).toContain('neu starten')
    expect(text).toContain('Sichere den aktuellen Stand')
    expect(text).toContain('„weitermachen“')
    expect(pauseRequest(90, 'de')).toContain('länger als 1 h 30 min')
    expect(resumeContext(12, 'de')).toContain('12 Minuten')
    expect(resumeContext(null, 'de')).not.toContain('dauerte')

    const english = pauseRequest(5, 'en')
    expect(english).toContain('longer than 5 minutes')
    expect(english).toContain('remaining time')
    expect(english).toContain('Save the current state')
    expect(english).toContain('"continue"')
    expect(english).not.toMatch(/[äöüß]/)
    expect(resumeContext(12, 'en')).toContain('12 minutes')
    expect(resumeText('de')).toBe('weitermachen')
    expect(resumeText('en')).toBe('continue')
    expect(isResume(resumeText('en'))).toBe(true)
  })

  test('the language is read off the option and locales', async () => {
    expect(langOf('de-DE')).toBe('de')
    expect(langOf('de_DE.UTF-8')).toBe('de')
    expect(langOf('German')).toBe('de')
    expect(langOf('deutsch')).toBe('de')
    expect(langOf('en-US')).toBe('en')
    expect(langOf('japanese')).toBe('en')
    expect(langOf('')).toBeNull()
    expect(langOf('auto')).toBeNull()
    expect(langOf(undefined)).toBeNull()
  })

  test('tasks, times and origins', async () => {
    expect(inFlight(undefined)).toBe(0)
    expect(inFlight([{ status: 'running' }, { status: 'pending' }, { status: 'completed' }])).toBe(2)
    expect(sinceText(0, 30_000, 'de')).toBe('gerade eben')
    expect(sinceText(0, 12 * 60_000, 'de')).toBe('seit 12 m')
    expect(sinceText(0, 65 * 60_000, 'de')).toBe('seit 1 h 05 m')
    expect(sinceText(0, 30_000, 'en')).toBe('just now')
    expect(sinceText(0, 12 * 60_000, 'en')).toBe('for 12 m')
    expect(formatMinutes(1, 'de')).toBe('1 Minute')
    expect(formatMinutes(1, 'en')).toBe('1 minute')
    expect(strings('de').tasksLeft(2)).toBe(' · 2 Tasks laufen noch')
    expect(strings('en').tasksLeft(1)).toBe(' · 1 task still running')
    expect(isPersonOrigin({ kind: 'composer' })).toBe(true)
    expect(isPersonOrigin({ kind: 'sdk' })).toBe(true)
    expect(isPersonOrigin({ kind: 'task-notification' })).toBe(false)
    expect(isPersonOrigin({ kind: 'scheduled-trigger' })).toBe(false)
    expect(isPersonOrigin({ kind: 'plugin', name: 'cache-weather-and-pause-resume' })).toBe(true)
    expect(isPersonOrigin({ kind: 'plugin', name: 'other' })).toBe(false)
  })
})

describe('the pause button', () => {
  test('pauses an idle session, waits for its tasks, then turns into „Weitermachen“', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1_000_000 })
    const session = mock.session(on)
    const prompts = engine(on)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ key: 'pause' })).toBeDefined()
      expect(await ui.find({ key: 'resume' })).toBeUndefined()

      const before = prompts.length
      await ui.press({ key: 'pause' })
      const asked = prompts[before]
      expect(asked?.text).toContain('⏸ Pause-Knopf: Der Mensch bittet dich, die Sitzung zu pausieren.')
      expect(asked?.origin).toEqual(OWN)
      expect(await ui.find({ key: 'pause' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /Pause angefordert/ })).toBeDefined()
      expect(await ui.find({ key: 'pause-cancel' })).toBeUndefined()
      expect(await ui.find({ key: 'compact' })).toBeDefined()

      // Claude stops while a run is still in flight: still pausing, the band counts it.
      await $.classic.Stop(stop('running'))
      expect(await ui.find({ type: 'Text', text: /1 Task läuft noch/ })).toBeDefined()
      expect(await ui.find({ key: 'resume' })).toBeUndefined()

      // Nothing in flight any more: paused.
      await $.classic.Stop(stop())
      expect(await ui.find({ key: 'resume' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /pausiert/ })).toBeDefined()

      // A question in the pause carries the note; the session stays paused.
      await $.prompt.submit(typed('Wie weit war die Suite?'))
      expect(prompts.at(-1)?.context).toEqual([PAUSED_PERSON_NOTE])
      await $.prompt.submit({ text: 'Task b2 finished', wait: false, origin: { kind: 'task-notification' } })
      expect(prompts.at(-1)?.context).toEqual([PAUSED_MACHINE_NOTE])
      expect(await ui.find({ key: 'resume' })).toBeDefined()

      // „Weitermachen“: the note goes ahead as a row of its own, then „weitermachen“ as the person's prompt.
      await ui.press({ key: 'resume' })
      expect(prompts.at(-1)?.text).toBe('weitermachen')
      expect(prompts.at(-1)?.origin).toEqual(OWN)
      expect(JSON.stringify(session.appended().at(-1)?.message.content)).toContain('Die Pause ist beendet')
      expect(await ui.find({ key: 'pause' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('in a terminal the pause signs are narrow (❚❚, ►), in the desktop app emoji (⏸, ⏳, ▶)', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1_000_000 })
    mock.session(on)
    engine(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await terminal.find({ key: 'pause' }))?.props.label).toBe('❚❚ Pause')
    await terminal.press({ key: 'pause' })
    expect(await terminal.find({ type: 'Text', text: /^❚❚ Pause angefordert$/ })).toBeDefined()
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await desktop.find({ type: 'Text', text: /^⏳ Pause angefordert$/u })).toBeDefined()

    await $.classic.Stop(stop())
    expect((await terminal.find({ key: 'resume' }))?.props.label).toBe('► Weitermachen')
    expect((await desktop.find({ key: 'resume' }))?.props.label).toBe('▶ Weitermachen')
    await terminal.unmount()
    await desktop.unmount()
  })

  test('typed „pausieren“ and „weitermachen“ work like the button', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 5_000_000 })
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await $.prompt.submit(typed('pausieren'))
    expect(prompts.at(-1)?.context?.[0]).toContain('die Sitzung zu pausieren')
    expect(await ui.find({ type: 'Text', text: /Pause angefordert/ })).toBeDefined()

    await $.prompt.submit(typed('abbrechen, nach der Pause neu starten'))
    expect(prompts.at(-1)?.context).toEqual([PAUSING_NOTE])

    await $.classic.Stop(stop())
    expect(await ui.find({ key: 'resume' })).toBeDefined()

    await $.prompt.submit(typed('Weitermachen'))
    expect(prompts.at(-1)?.context?.[0]).toContain('Die Pause ist beendet')
    expect(await ui.find({ key: 'pause' })).toBeDefined()

    // Running: an ordinary prompt passes untouched, „weitermachen“ too.
    await $.prompt.submit(typed('weitermachen'))
    expect(prompts.at(-1)?.context).toBeUndefined()
    await ui.unmount()
  })

  test('mid-turn the request joins the running turn, and is handed on should the turn end unread', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 9_000_000 })
    const session = mock.session(on)
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.turn.start({ text: 'baue das Feature', turnId: 't1' })
    await ui.press({ key: 'pause' })
    const row = session.appended().at(-1)
    expect(row?.door).toBe('note')
    expect(JSON.stringify(row?.message.content)).toContain('die Sitzung zu pausieren')
    expect(prompts.length).toBe(0)

    // The turn ended before another request: Claude does not stop yet but goes on with the request.
    const stopped = await $.classic.Stop(stop())
    expect(stopped.block).toContain('die Sitzung zu pausieren')
    expect(await ui.find({ key: 'resume' })).toBeUndefined()

    // Claude handled it and stopped: paused.
    const done = await $.classic.Stop({ stop_hook_active: true, background_tasks: [] })
    expect(done.block).toBeUndefined()
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    await ui.unmount()
  })

  test('a subagent’s turn does not count as Claude working: the request goes as a prompt (Claude Code 2.1.299)', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 9_000_000 })
    const session = mock.session(on)
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.turn.start({ text: '', turnId: 'sub-1', agentId: 'agent-1' } as { text: string; turnId: string })
    await ui.press({ key: 'pause' })
    expect(prompts.at(-1)?.text).toContain('die Sitzung zu pausieren')
    expect(session.appended().length).toBe(0)
    await ui.unmount()
  })

  test('mid-turn, a turn interrupted before it read the request hands it to the next prompt whole', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 9_000_000 })
    mock.session(on)
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await $.turn.start({ text: 'baue das Feature', turnId: 't1' })
    await ui.press({ key: 'pause' })
    await $.prompt.submit(typed('und?'))
    expect(prompts.at(-1)?.context?.[0]).toContain('die Sitzung zu pausieren')
    await $.prompt.submit(typed('noch da?'))
    expect(prompts.at(-1)?.context).toEqual([PAUSING_NOTE])
    await ui.unmount()
  })
})

describe('the pause across a restart', () => {
  test('a pause is kept on disk under the session id, and „Weitermachen“ takes it off', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 2_000_000 })
    mock.session(on)
    const files = disk(on)
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await ui.press({ key: 'pause' })
    await $.classic.Stop(stop(undefined, 'sess-1'))
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    expect(JSON.parse(files[STATE] ?? '{}').pausedSessions).toEqual({ 'sess-1': 2_000_000 })

    await ui.press({ key: 'resume' })
    expect(JSON.parse(files[STATE] ?? '{}').pausedSessions).toEqual({})
    await ui.unmount()
  })

  test('a session that comes back while paused shows „Weitermachen“, another one „Pause“', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 9_000_000 })
    disk(on, { [STATE]: JSON.stringify({ pausedSessions: { 'sess-2': 3_000_000 } }) })
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await $.classic.SessionStart({ source: 'startup', session_id: 'sess-other' })
    expect(await ui.find({ key: 'pause' })).toBeDefined()

    await $.classic.SessionStart({ source: 'resume', session_id: 'sess-2' })
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /pausiert seit 1 h 40 m$/ })).toBeDefined()
    await ui.unmount()
  })

  test('remembered pauses of deleted sessions are dropped a little after the start, the rest stays', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    const paused = { alive: 1_000_000, gone: 2_000_000, current: 3_000_000 }
    const files = disk(on, {
      [STATE]: JSON.stringify({ pausedSessions: paused, ttlMinutes: 60 }),
      [`${PROJECTS}/C--repo/alive.jsonl`]: '{}',
      [`${PROJECTS}/C--other/unrelated.jsonl`]: '{}',
    })
    engine(on)

    // The session that starts has no transcript yet; it is kept all the same.
    await $.classic.SessionStart({ source: 'resume', session_id: 'current' })
    expect(JSON.parse(files[STATE] ?? '{}').pausedSessions).toEqual(paused)
    await clock.advance(10_000)
    const after = JSON.parse(files[STATE] ?? '{}')
    expect(after.pausedSessions).toEqual({ alive: 1_000_000, current: 3_000_000 })
    expect(after.ttlMinutes).toBe(60)
  })

  test('an unreadable projects folder drops nothing', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    const paused = { a: 1_000_000, b: 2_000_000 }
    const files = disk(on, { [STATE]: JSON.stringify({ pausedSessions: paused }) })
    engine(on)

    await $.classic.SessionStart({ source: 'startup', session_id: 'c' })
    await clock.advance(10_000)
    expect(JSON.parse(files[STATE] ?? '{}').pausedSessions).toEqual(paused)
  })

  test('a resumed session counts the cache down from its last response, read off the start', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 10_000_000 })
    disk(on)
    engine(on)
    on('classic.PostModelSwitch', () => ({}))
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await $.classic.SessionStart({ source: 'resume', session_id: 'sess-3', seconds_since_last_response: 120 })
    await $.classic.PostModelSwitch({ cache_ttl: '1h' })
    expect(await ui.find({ type: 'Text', text: /^Cache 58 m/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('the cache lifetime', () => {
  const HOUR = 3_600_000
  const ONE_HOUR_WRITE =
    '{"type":"assistant","timestamp":"2026-10-12T08:00:00.000Z","message":{"usage":{"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1624}}}}'

  test('a start after /compact or /clear takes the lifetime last seen: confirmed within a day, without „?“', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 100 * HOUR })
    disk(on, { [STATE]: JSON.stringify({ ttlMinutes: 60, ttlConfirmedAt: 99 * HOUR }) })
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: /^Cache \?$/ })).toBeDefined()
    await $.classic.SessionStart({ source: 'compact', session_id: 'c1' })
    expect(await ui.find({ type: 'Text', text: /^Cache –$/ })).toBeDefined()
    await ui.unmount()
  })

  test('one last confirmed more than a day ago keeps its „?“', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 100 * HOUR })
    disk(on, { [STATE]: JSON.stringify({ ttlMinutes: 60, ttlConfirmedAt: 70 * HOUR }) })
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'clear', session_id: 'c2' })
    expect(await ui.find({ type: 'Text', text: /^Cache – \(1 h\?\)$/ })).toBeDefined()
    await ui.unmount()
  })

  test('a lifetime read off the transcript is kept on disk as confirmed', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 100 * HOUR })
    const files = disk(on, { [`${PROJECTS}/C--repo/t1.jsonl`]: `${ONE_HOUR_WRITE}\n` })
    on('fs.stat', () => ({ value: { kind: 'file', size: 200, mtimeMs: 0, isLink: false } }))
    engine(on)
    await $.classic.Stop({
      stop_hook_active: false,
      session_id: 't1',
      transcript_path: 'C:\\Users\\test\\.claude\\projects\\C--repo\\t1.jsonl',
      background_tasks: [],
    })
    const saved = JSON.parse(files[STATE] ?? '{}')
    expect(saved.ttlMinutes).toBe(60)
    expect(saved.ttlConfirmedAt).toBe(100 * HOUR)
  })

  test('a resumed session tells the lifetime: not likely expired after 20 minutes means 1 h', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 100 * HOUR })
    const files = disk(on)
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({
      source: 'resume',
      session_id: 'r1',
      seconds_since_last_response: 1200,
      prompt_cache_likely_expired: false,
    })
    expect(await ui.find({ type: 'Text', text: /^Cache 40 m$/ })).toBeDefined()
    expect(JSON.parse(files[STATE] ?? '{}').ttlConfirmedAt).toBe(100 * HOUR)
    await ui.unmount()
  })

  test('… and likely expired after 20 minutes means 5 m', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 100 * HOUR })
    const files = disk(on)
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({
      source: 'resume',
      session_id: 'r2',
      seconds_since_last_response: 1200,
      prompt_cache_likely_expired: true,
    })
    expect(await ui.find({ type: 'Text', text: /^Cache abgelaufen/ })).toBeDefined()
    expect(JSON.parse(files[STATE] ?? '{}').ttlMinutes).toBe(5)
    await ui.unmount()
  })
})

describe('keep-alive', () => {
  // These move the clock on by hours in steps of 15 seconds: more time than the default 5 seconds on a busy machine.
  const SLOW = { ...DE, timeoutMs: 30_000 }
  const MIN = 60_000
  const HOUR = 60 * MIN
  const START = 100 * HOUR
  const WARM = { input_tokens: 30, output_tokens: 2, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 0 }
  const COLD = { input_tokens: 150_030, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

  // The refreshes the mod asks for, answered from the cache (or not), and the lines it logs.
  function forks(on: On, usage = WARM): { prompts: string[]; logs: string[] } {
    const prompts: string[] = []
    const logs: string[] = []
    on('model.fork', ($, e) => {
      prompts.push(e.prompt)
      return { value: { isAnswered: true, text: 'OK', usage } }
    })
    on('ui.log', ($, e) => {
      logs.push(e.text)
      return { value: undefined }
    })
    on('classic.PostModelSwitch', () => ({}))
    return { prompts, logs }
  }

  // A session resumed `ago` milliseconds after its last response, with the given cache lifetime.
  async function resumed($: Engine, ago: number, ttl: '5m' | '1h'): Promise<void> {
    await $.classic.SessionStart({ source: 'resume', session_id: 'k1', seconds_since_last_response: ago / 1000 })
    await $.classic.PostModelSwitch({ cache_ttl: ttl })
  }

  test('the checkbox is the person’s alone: off at first, switched by a press, kept on disk for this session', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    const files = disk(on)
    engine(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 's1' })
    expect((await terminal.find({ key: 'keep-alive' }))?.props.label).toBe('[ ] Keep-alive')
    await terminal.press({ key: 'keep-alive' })
    expect((await terminal.find({ key: 'keep-alive' }))?.props.label).toBe('[✓] Keep-alive')
    expect(JSON.parse(files[STATE] ?? '{}').keepAliveSessions).toEqual({ s1: START })
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await desktop.find({ key: 'keep-alive' }))?.props.label).toBe('☑ Keep-alive')
    await desktop.press({ key: 'keep-alive' })
    expect(JSON.parse(files[STATE] ?? '{}').keepAliveSessions).toEqual({})
    await terminal.unmount()
    await desktop.unmount()
  })

  test('a session resumed keeps its switch; another one, and the one after /clear, start without', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepAliveSessions: { k1: 1 } }) })
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'resume', session_id: 'k1' })
    expect((await ui.find({ key: 'keep-alive' }))?.props.label).toBe('[✓] Keep-alive')
    await $.classic.SessionStart({ source: 'clear', session_id: 'k2' })
    expect((await ui.find({ key: 'keep-alive' }))?.props.label).toBe('[ ] Keep-alive')
    await ui.unmount()
  })

  test('off, nothing is refreshed', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on)
    engine(on)
    const asked = forks(on)
    await resumed($, 2 * MIN, '1h')
    await clock.advance(2 * HOUR)
    expect(asked.prompts.length).toBe(0)
  })

  test('the hour cache is refreshed five minutes before it lapses, and counts down afresh', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepAliveSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 2 * MIN, '1h')

    await clock.advance(52 * MIN)
    expect(asked.prompts.length).toBe(0)
    await clock.advance(MIN)
    expect(asked.prompts.length).toBe(1)
    expect(asked.prompts[0]).toContain('keep-alive')
    expect(asked.logs.at(-1)).toBe('↻ Keep-alive: Cache aufgefrischt (150.000 Tokens aus dem Cache gelesen, 2 Tokens Antwort)')
    expect(await ui.find({ type: 'Text', text: /^Cache 60 m/ })).toBeDefined()
    expect((await ui.find({ key: 'keep-alive' }))?.props.label).toBe('☑ Keep-alive ↻1')

    await clock.advance(55 * MIN)
    expect(asked.prompts.length).toBe(2)
    await ui.unmount()
  })

  test('while Claude works there is no limit', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepAliveSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    await resumed($, 0, '5m')
    await $.turn.start({ text: 'die lange Suite', turnId: 't1' })

    await clock.advance(HOUR)
    // Every 4 minutes, past the 45 minutes an idle session gets.
    expect(asked.prompts.length).toBe(15)
  })

  test('the five-minute cache is refreshed a minute before it lapses, for 45 minutes', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepAliveSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 0, '5m')

    await clock.advance(HOUR)
    // At 4, 8, … 44 minutes; the one due at 48 is past the 45 minutes. (The hour cache's 8 hours: the logic's tests.)
    expect(asked.prompts.length).toBe(11)
    expect(await ui.find({ type: 'Text', text: /^endete nach 45 m ohne Eingabe$/ })).toBeDefined()
    expect(asked.logs.at(-1)).toContain('nach 45 m ohne Eingabe nicht weiter aufgefrischt')
    // The checkbox stays as the person set it.
    expect((await ui.find({ key: 'keep-alive' }))?.props.label).toMatch(/^☑ Keep-alive/)
    await ui.unmount()
  })

  test('switching it off and on clears the note; with the cache gone it waits for the next request', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepAliveSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await resumed($, 0, '5m')
    await clock.advance(HOUR)
    expect(asked.prompts.length).toBe(11)

    await ui.press({ key: 'keep-alive' })
    await ui.press({ key: 'keep-alive' })
    expect(await ui.find({ type: 'Text', text: /ohne Eingabe/ })).toBeUndefined()
    await clock.advance(HOUR)
    expect(asked.prompts.length).toBe(11)
    await ui.unmount()
  })

  test('a refresh that finds the cache gone stops until the next request, and says so', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepAliveSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on, COLD)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await resumed($, 2 * MIN, '1h')

    await clock.advance(2 * HOUR)
    expect(asked.prompts.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /^Cache war schon abgelaufen$/ })).toBeDefined()
    expect(asked.logs.at(-1)).toContain('Der Cache war schon abgelaufen')
    await ui.unmount()
  })

  test('the bar takes the cache’s colour: red with 10 of 60 minutes left', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on)
    engine(on)
    forks(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 50 * MIN, '1h')
    expect((await terminal.find({ type: 'Text', text: /^━+$/ }))?.props.color).toBe('error')
    expect((await terminal.find({ type: 'Text', text: /^Cache 10 m$/ }))?.props.color).toBe('error')
    expect((await desktop.find({ type: 'Svg' }))?.props.source).toContain('fill="#e5484d"')
    await terminal.unmount()
    await desktop.unmount()
  })

  test('an expired cache hides hits, context and threshold', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on)
    engine(on)
    forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await resumed($, 2 * HOUR, '1h')
    expect(await ui.find({ type: 'Text', text: /^Cache abgelaufen$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Hits / })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Ctx/ })).toBeUndefined()
    expect(await ui.find({ key: 'keep-alive' })).toBeDefined()
    await ui.unmount()
  })
})

describe('in English', () => {
  test('the band, the request and „Resume“ read English', EN, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1_000_000 })
    mock.session(on)
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await ui.press({ key: 'pause' })
    expect(prompts.at(-1)?.text).toContain('⏸ Pause button: the person asks you to pause the session.')
    expect(await ui.find({ type: 'Text', text: /Pause requested/ })).toBeDefined()

    await $.classic.Stop(stop('running'))
    expect(await ui.find({ type: 'Text', text: /1 task still running/ })).toBeDefined()
    await $.classic.Stop(stop())
    expect(await ui.find({ type: 'Text', text: /paused just now/ })).toBeDefined()

    await ui.press({ key: 'resume' })
    expect(prompts.at(-1)?.text).toBe('continue')
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    await ui.unmount()
  })

  test('typed „pause“ pauses and „continue“ resumes, with English notes', EN, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 5_000_000 })
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    await $.prompt.submit(typed('pause'))
    expect(prompts.at(-1)?.context?.[0]).toContain('asks you to pause the session')
    await $.prompt.submit(typed('how long is left?'))
    expect(prompts.at(-1)?.context).toEqual([pausingNote('en')])
    await $.classic.Stop(stop())
    await $.prompt.submit(typed('continue'))
    expect(prompts.at(-1)?.context?.[0]).toContain('the pause is over')
    await ui.unmount()
  })
})
