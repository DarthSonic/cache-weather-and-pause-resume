import { describe, expect, mock, test } from 'claude-code/testing'
import type { On, PromptSubmitInput } from 'claude-code'

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
  plugin: 'cache-wetter',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const OWN = { kind: 'plugin', name: 'cache-wetter', asUser: true }

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

// The user's disk as the engine reaches it: a map of files, under a home folder the environment names.
const HOME = 'C:\\Users\\test'
const STATE = 'C:\\Users\\test\\.claude\\cache-wetter\\state.json'
function disk(on: On, seed: Record<string, string> = {}): Record<string, string> {
  const files: Record<string, string> = { ...seed }
  mock.env(on, { USERPROFILE: HOME })
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.read', ($, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('fs.write', ($, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  // A folder lists what the map holds beneath it: the next path segment, a file where nothing follows.
  on('fs.list', ($, e) => {
    const prefix = `${e.path}\\`
    const seen = new Map<string, 'file' | 'dir'>()
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length).split('\\')
      const name = rest[0] ?? ''
      seen.set(name, rest.length > 1 ? 'dir' : seen.get(name) ?? 'file')
    }
    if (seen.size === 0) throw new Error(`ENOENT: ${e.path}`)
    return { value: [...seen].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('classic.SessionStart', () => ({}))
  return files
}

const PROJECTS = 'C:\\Users\\test\\.claude\\projects'

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

  test('the language is read off settings and locales', async () => {
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
    expect(isPersonOrigin({ kind: 'plugin', name: 'cache-wetter' })).toBe(true)
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
      [STATE]: JSON.stringify({ pausedSessions: paused, isCollapsed: true }),
      [`${PROJECTS}\\C--repo\\alive.jsonl`]: '{}',
      [`${PROJECTS}\\C--other\\unrelated.jsonl`]: '{}',
    })
    engine(on)

    // The session that starts has no transcript yet; it is kept all the same.
    await $.classic.SessionStart({ source: 'resume', session_id: 'current' })
    expect(JSON.parse(files[STATE] ?? '{}').pausedSessions).toEqual(paused)
    await clock.advance(10_000)
    const after = JSON.parse(files[STATE] ?? '{}')
    expect(after.pausedSessions).toEqual({ alive: 1_000_000, current: 3_000_000 })
    expect(after.isCollapsed).toBe(true)
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

  test('the folded band is kept on disk too', DE, async ($, on) => {
    mock.store(on)
    const files = disk(on)
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await ui.press({ key: 'toggle' })
    expect(JSON.parse(files[STATE] ?? '{}').isCollapsed).toBe(true)
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
