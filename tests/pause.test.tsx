import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, On, PromptSubmitInput } from 'claude-code'

import { langOf, strings } from '../hooks/i18n'
import {
  PAUSE_TOOL,
  formatMinutes,
  inFlight,
  isPauseCommand,
  isPersonOrigin,
  isResume,
  pauseRequest,
  pausedMachineNote,
  pausedPersonNote,
  pausingNote,
  pauseToolDescription,
  resumeContext,
  resumeText,
} from '../hooks/pause'

// The button tests read German words: the language is pinned, never the locale of the machine they run on.
const DE = { options: { language: 'de' } }
const EN = { options: { language: 'en' } }
// Keep-warm is on in a new session unless the option says off.
const DE_COLD = { options: { language: 'de', keepWarm: 'off' } }
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
function disk(on: On, seed: Record<string, string> = {}, env: Record<string, string> = {}): Record<string, string> {
  const files: Record<string, string> = { ...seed }
  mock.env(on, { USERPROFILE: HOME, ...env })
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

  test('the tool tells Claude when to report a pause and when the work goes on, and the texts name it', async () => {
    const text = pauseToolDescription(5)
    expect(text).toContain('state "paused"')
    expect(text).toContain('state "running"')
    expect(text).toContain('in any words or language')
    expect(text).toContain('longer than 5 minutes')
    expect(pauseRequest(5, 'de')).toContain('pause_state mit state „paused“')
    expect(pauseRequest(5, 'en')).toContain('pause_state with state "paused"')
    expect(pausedPersonNote('de')).toContain('pause_state mit state „running“')
    expect(pausingNote('en')).toContain('pause_state with state "paused"')
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
  test('pauses an idle session, waits for its tasks, then turns into „Weiter“', DE, async ($, on) => {
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
      expect(await ui.find({ type: 'Text', text: /Pause wird vorbereitet/ })).toBeDefined()
      // „Weiter“ stands ready to call the pause off (0.9.3).
      expect((await ui.find({ key: 'pause-cancel' }))?.props.label).toBe(surface === 'terminal' ? 'Weiter' : '▶︎ Weiter')
      expect(await ui.find({ key: 'compact' })).toBeDefined()

      // Claude stops while a run is still in flight: still pausing, the band counts it.
      await $.classic.Stop(stop('running'))
      expect(await ui.find({ type: 'Text', text: /1 Task läuft noch/ })).toBeDefined()
      expect(await ui.find({ key: 'resume' })).toBeUndefined()

      // Nothing in flight any more: paused.
      await $.classic.Stop(stop())
      expect(await ui.find({ key: 'resume' })).toBeDefined()
      // How long it has been paused stands in the status row (0.9.3), never as „0 min“.
      expect(await ui.find({ type: 'Text', text: /^Pausiert seit < 1 min$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Pause wird vorbereitet/ })).toBeUndefined()

      // A question in the pause carries the note; the session stays paused.
      await $.prompt.submit(typed('Wie weit war die Suite?'))
      expect(prompts.at(-1)?.context).toEqual([PAUSED_PERSON_NOTE])
      await $.prompt.submit({ text: 'Task b2 finished', wait: false, origin: { kind: 'task-notification' } })
      expect(prompts.at(-1)?.context).toEqual([PAUSED_MACHINE_NOTE])
      expect(await ui.find({ key: 'resume' })).toBeDefined()

      // „Weiter“: the note goes ahead as a row of its own, then „weitermachen“ as the person's prompt.
      await ui.press({ key: 'resume' })
      expect(prompts.at(-1)?.text).toBe('weitermachen')
      expect(prompts.at(-1)?.origin).toEqual(OWN)
      expect(JSON.stringify(session.appended().at(-1)?.message.content)).toContain('Die Pause ist beendet')
      expect(await ui.find({ key: 'pause' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('in the desktop app each button holds its icon and its word in small type; a terminal shows the word', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1_000_000 })
    mock.session(on)
    const prompts = engine(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    for (const [key, label] of [['sessions', 'Sitzungen'], ['compact', 'Compact'], ['pause', 'Pause'], ['shutdown', 'Shutdown']]) {
      expect((await terminal.find({ key }))?.props.label).toBe(label)
    }
    await terminal.unmount()
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    for (const [key, label] of [['sessions', '⧉ Sitzungen'], ['compact', '⇲ Compact'], ['pause', '⏸︎ Pause'], ['shutdown', '⏻ Shutdown']]) {
      expect((await desktop.find({ key }))?.props.label).toBe(label)
    }
    for (const words of ['Sitzungen', 'Compact', 'Pause', 'Shutdown']) {
      expect((await desktop.find({ type: 'Text', text: new RegExp(`^${words}$`) }))?.props.size).toBe('caption')
    }
    // Nothing waits hidden for the pointer any more (2026-11-09): a word shown on hover pushed the buttons aside.
    expect(await desktop.find({ key: 'hint-pause-words' })).toBeUndefined()
    expect(await desktop.find({ key: 'hint-pause-group' })).toBeUndefined()
    await desktop.press({ key: 'pause' })
    expect(prompts.at(-1)?.text).toContain('⏸ Pause-Knopf: Der Mensch bittet dich, die Sitzung zu pausieren.')
    expect((await desktop.find({ key: 'pause-cancel' }))?.props.label).toBe('▶︎ Weiter')
    await desktop.unmount()
  })

  test('in a terminal the pause signs are narrow (❚❚, ►), in the desktop app emoji (⏸, ⏳, ▶)', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1_000_000 })
    mock.session(on)
    engine(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await terminal.find({ key: 'pause' }))?.props.label).toBe('Pause')
    await terminal.press({ key: 'pause' })
    expect(await terminal.find({ type: 'Text', text: /^❚❚ Pause wird vorbereitet …$/ })).toBeDefined()
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect(await desktop.find({ type: 'Text', text: /^⏳ Pause wird vorbereitet …$/u })).toBeDefined()

    await $.classic.Stop(stop())
    expect((await terminal.find({ key: 'resume' }))?.props.label).toBe('Weiter')
    expect((await desktop.find({ key: 'resume' }))?.props.label).toBe('▶︎ Weiter')
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
    expect(await ui.find({ type: 'Text', text: /Pause wird vorbereitet/ })).toBeDefined()

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

describe('the pause by Claude\'s word', () => {
  test('a pause Claude reports through its tool shows „Weiter“ and is kept; „running“ takes it off', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 9_000_000 })
    const files = disk(on)
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'w1' })

    // Typed in words the band does not know: Claude pauses, then says so.
    await $.prompt.submit(typed('Lass uns hier Schluss machen für heute, ich muss los.'))
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    const paused = await $.tool.call({ tool: PAUSE_TOOL, state: 'paused' } as never)
    expect(JSON.stringify(paused)).toContain('paused')
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    expect(JSON.parse(files[STATE] ?? '{}').pausedSessions).toEqual({ w1: 9_000_000 })

    // A message in the pause carries the note that names the tool; Claude decides it resumes the work.
    await $.prompt.submit(typed('So, jetzt geht es weiter mit dem Feature.'))
    expect(prompts.at(-1)?.context?.[0]).toContain('pause_state mit state „running“')
    await $.tool.call({ tool: PAUSE_TOOL, state: 'running' } as never)
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    expect(JSON.parse(files[STATE] ?? '{}').pausedSessions).toEqual({})
    await ui.unmount()
  })

  test('a subagent cannot report the pause', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 9_000_000 })
    disk(on)
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.tool.call({ tool: PAUSE_TOOL, state: 'paused', agentId: 'agent-1' } as never)
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    await ui.unmount()
  })
})

describe('the shutdown button', () => {
  const PRIVILEGES = 'SeShutdownPrivilege   Herunterfahren des Systems   Deaktiviert'
  // By full path from Windows' own folder (no SystemRoot in the test: the default).
  const WHOAMI = 'C:\\Windows\\System32\\whoami.exe'
  const SHUTDOWN = 'C:\\Windows\\System32\\shutdown.exe'

  // Windows with or without the right to shut down; the commands the mod runs are recorded, none really runs.
  function windows(on: On, privileges = PRIVILEGES): { runs: string[][]; logs: string[] } {
    const runs: string[][] = []
    const logs: string[] = []
    on('process.run', ($, e) => {
      runs.push([...e.argv])
      const stdout = e.argv[0] === WHOAMI ? privileges : ''
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.log', ($, e) => {
      logs.push(e.text)
      return { value: undefined }
    })
    return { runs, logs }
  }

  test('dimmed where the computer cannot be shut down unattended, and a press says what is missing', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    engine(on)
    const host = windows(on, 'SeChangeNotifyPrivilege   Auslassen der durchsuchenden Überprüfung   Aktiviert')
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'x1' })
    await clock.settle()
    expect((await ui.find({ key: 'shutdown' }))?.props.dimColor).toBe(true)
    await ui.press({ key: 'shutdown' })
    expect(host.logs.at(-1)).toContain('SeShutdownPrivilege')
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    expect(host.runs).toEqual([[WHOAMI, '/priv']])
    await ui.unmount()
  })

  test('pauses first, asks Claude to ask now, counts down 5 minutes, then shuts down', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    const prompts = engine(on)
    const host = windows(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'x2' })
    await clock.settle()
    expect((await ui.find({ key: 'shutdown' }))?.props.dimColor).toBe(false)

    await ui.press({ key: 'shutdown' })
    expect(prompts.at(-1)?.text).toContain('die Sitzung zu pausieren')
    expect(prompts.at(-1)?.text).toContain('⏻ Shutdown-Knopf')
    expect(await ui.find({ type: 'Text', text: /Shutdown wird vorbereitet/ })).toBeDefined()

    await $.classic.Stop(stop(undefined, 'x2'))
    expect(await ui.find({ type: 'Text', text: /^Shutdown in 5:00$/ })).toBeDefined()
    expect(await ui.find({ key: 'shutdown-cancel' })).toBeDefined()
    await clock.advance(235_000)
    expect(await ui.find({ type: 'Text', text: /^Shutdown in 1:05$/ })).toBeDefined()
    await clock.advance(64_000)
    expect(await ui.find({ type: 'Text', text: /^Shutdown in 1 s$/ })).toBeDefined()
    expect(host.runs.some(argv => argv[0] === SHUTDOWN)).toBe(false)
    await clock.advance(1_000)
    expect(host.runs.at(-1)?.slice(0, 3)).toEqual([SHUTDOWN, '/s', '/f'])
    expect(host.logs.at(-1)).toContain('fährt jetzt herunter')
    expect(await ui.find({ type: 'Text', text: /Fährt herunter/ })).toBeDefined()
    await ui.unmount()
  })

  // After a /clear the session can stand without the answer of the check its start made (Claude Code 2.1.317): the
  // module's own flag kept the check from running again, and every press said „wird noch geprüft“ (0.9.0).
  test('a start or a press that finds no answer checks again; a press then goes on', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    const prompts = engine(on)
    const host = windows(on)
    // The next read of the answer finds none, as a session after /clear did.
    let lostReads = 0
    on('state.get', async ($, e, next) => {
      if (lostReads > 0 && e.key === 'shutdownReadiness') {
        lostReads -= 1
        return { value: { value: undefined, version: 0 } }
      }
      return next(e)
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'x5' })
    await clock.settle()
    expect(host.runs).toEqual([[WHOAMI, '/priv']])
    await $.classic.SessionStart({ source: 'compact', session_id: 'x5' })
    await clock.settle()
    expect(host.runs.length).toBe(1)

    lostReads = 1
    await $.classic.SessionStart({ source: 'clear', session_id: 'x6' })
    await clock.settle()
    expect(host.runs.length).toBe(2)
    lostReads = 1
    await ui.press({ key: 'shutdown' })
    expect(host.runs.length).toBe(3)
    expect(prompts.at(-1)?.text).toContain('⏻ Shutdown-Knopf')
    await ui.unmount()
  })

  test('a press after a failed check checks again', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    const prompts = engine(on)
    const runs: string[][] = []
    on('process.run', ($, e) => {
      runs.push([...e.argv])
      if (runs.length === 1) throw new Error('whoami did not start')
      return { value: { exitCode: 0, stdout: PRIVILEGES, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'x7' })
    await clock.settle()
    expect((await ui.find({ key: 'shutdown' }))?.props.dimColor).toBe(true)
    await ui.press({ key: 'shutdown' })
    expect(runs).toEqual([[WHOAMI, '/priv'], [WHOAMI, '/priv']])
    expect(prompts.at(-1)?.text).toContain('⏻ Shutdown-Knopf')
    expect(await ui.find({ type: 'Text', text: /Shutdown wird vorbereitet/ })).toBeDefined()
    await ui.unmount()
  })

  // Standby and hibernation (0.9.5): the option names the button, and the computer comes back to paused sessions.
  const POWERCFG = 'C:\\Windows\\System32\\powercfg.exe'
  const REG = 'C:\\Windows\\System32\\reg.exe'
  const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  function windowsWith(on: On, answers: Record<string, string>): { runs: string[][]; logs: string[] } {
    const runs: string[][] = []
    const logs: string[] = []
    on('process.run', ($, e) => {
      runs.push([...e.argv])
      const stdout = e.argv[0] === WHOAMI ? PRIVILEGES : (answers[e.argv[0] ?? ''] ?? '')
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('ui.log', ($, e) => {
      logs.push(e.text)
      return { value: undefined }
    })
    return { runs, logs }
  }

  test('in standby mode the button says Standby, counts down, and the computer comes back to a paused session', { options: { language: 'de', shutdownMode: 'sleep' } }, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    const prompts = engine(on)
    const host = windowsWith(on, { [POWERCFG]: 'Verfügbar:\r\n    Standby (S3)\r\n\r\n' })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 's1' })
    await clock.settle()
    expect(host.runs).toEqual([[WHOAMI, '/priv'], [POWERCFG, '/a']])
    const button = await ui.find({ key: 'shutdown' })
    expect(button?.props.label).toBe('⏾ Standby')
    expect(button?.props.dimColor).toBe(false)

    await ui.press({ key: 'shutdown' })
    expect(prompts.at(-1)?.text).toContain('⏾ Standby-Knopf')
    expect(prompts.at(-1)?.text).toContain('den Rechner in den Standby schicken')
    expect(await ui.find({ type: 'Text', text: /Standby wird vorbereitet/ })).toBeDefined()
    await $.classic.Stop(stop(undefined, 's1'))
    expect(await ui.find({ type: 'Text', text: /^Standby in 5:00$/ })).toBeDefined()
    await clock.advance(300_000)
    const sleep = host.runs.at(-1) ?? []
    expect(sleep.slice(0, 2)).toEqual([POWERSHELL, '-NoProfile'])
    expect(host.logs.at(-1)).toContain('geht jetzt in den Standby')
    // Awake again: the session is still paused, nothing counts down.
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Standby in|Geht in den Standby/ })).toBeUndefined()
    await ui.unmount()
  })

  test('hibernation turned off in Windows leaves the button dimmed, and a press says how to turn it on', { options: { language: 'de', shutdownMode: 'hibernate' } }, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    engine(on)
    const host = windowsWith(on, { [REG]: '    HibernateEnabled    REG_DWORD    0x0\r\n' })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'h1' })
    await clock.settle()
    const button = await ui.find({ key: 'shutdown' })
    expect(button?.props.label).toBe('❄︎ Ruhezustand')
    expect(button?.props.dimColor).toBe(true)
    await ui.press({ key: 'shutdown' })
    expect(host.logs.at(-1)).toContain('powercfg /hibernate on')
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    await ui.unmount()
  })

  // The option changed while the session ran (2026-11-09): the answer held was checked for shutting down. The press must
  // check the mode now chosen, not pause on an answer that would have run `shutdown /s /f`.
  test('an answer checked for another mode counts for nothing: the press checks again', { options: { language: 'de', shutdownMode: 'hibernate' } }, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    const prompts = engine(on)
    const host = windowsWith(on, { [REG]: '    HibernateEnabled    REG_DWORD    0x0\r\n' })
    // The next read of the answer finds the one a session held before the option changed: ready to shut down.
    let staleReads = 0
    on('state.get', async ($, e, next) => {
      if (staleReads > 0 && e.key === 'shutdownReadiness') {
        staleReads -= 1
        return { value: { value: { isReady: true, os: 'windows', command: [SHUTDOWN, '/s', '/f'] }, version: 1 } }
      }
      return next(e)
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'm1' })
    await clock.settle()
    const before = prompts.length
    staleReads = 1
    await ui.press({ key: 'shutdown' })
    expect(prompts.length).toBe(before)
    expect(host.logs.at(-1)).toContain('powercfg /hibernate on')
    expect(host.runs.filter(argv => argv[0] === REG).length).toBe(2)
    expect(host.runs.some(argv => argv[0] === SHUTDOWN)).toBe(false)
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    await ui.unmount()
  })

  // The last chance to cancel, through Claude Code's own notification channel (0.9.4); the option turns it off.
  for (const [name, options, expected] of [
    ['the countdown raises one notification', DE, 1],
    ['… and none with the option off', { options: { language: 'de', notifications: 'off' } }, 0],
  ] as const) {
    test(name, options, async ($, on) => {
      mock.store(on)
      const clock = mock.clock(on, { now: 9_000_000 })
      disk(on, {}, { OS: 'Windows_NT' })
      engine(on)
      windows(on)
      const notes: { text: string; title?: string }[] = []
      on('ui.notify', ($, e) => {
        notes.push({ text: e.text, title: e.title })
        return { value: { isSent: true, channel: 'kitty' } }
      })
      const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
      await $.classic.SessionStart({ source: 'startup', session_id: 'n1' })
      await clock.settle()
      await ui.press({ key: 'shutdown' })
      expect(notes).toEqual([])
      await $.classic.Stop(stop(undefined, 'n1'))
      await clock.advance(1_000)
      expect(notes.length).toBe(expected)
      if (expected === 1) {
        expect(notes[0]?.title).toBe('Shutdown in 5 min')
        expect(notes[0]?.text).toContain('fährt gleich herunter')
      }
      await ui.press({ key: 'shutdown-cancel' })
      await ui.unmount()
    })
  }

  test('the cancel button stops the countdown; the session stays paused', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    engine(on)
    const host = windows(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'x3' })
    await clock.settle()
    await ui.press({ key: 'shutdown' })
    await $.classic.Stop(stop(undefined, 'x3'))
    await ui.press({ key: 'shutdown-cancel' })
    await clock.advance(120_000)
    expect(host.runs.some(argv => argv[0] === SHUTDOWN)).toBe(false)
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    await ui.unmount()
  })

  test('picking the work back up drops the shutdown that was asked for', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: 9_000_000 })
    disk(on, {}, { OS: 'Windows_NT' })
    engine(on)
    const host = windows(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'x4' })
    await clock.settle()
    await ui.press({ key: 'shutdown' })
    await $.prompt.submit(typed('weitermachen'))
    await $.classic.Stop(stop(undefined, 'x4'))
    await clock.advance(120_000)
    expect(host.runs.some(argv => argv[0] === SHUTDOWN)).toBe(false)
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    await ui.unmount()
  })
})

describe('the pause across a restart', () => {
  test('a pause is kept on disk under the session id, and „Weiter“ takes it off', DE, async ($, on) => {
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

  test('a session that comes back while paused shows „Weiter“, another one „Pause“', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 9_000_000 })
    disk(on, { [STATE]: JSON.stringify({ pausedSessions: { 'sess-2': 3_000_000 } }) })
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

    await $.classic.SessionStart({ source: 'startup', session_id: 'sess-other' })
    expect(await ui.find({ key: 'pause' })).toBeDefined()

    await $.classic.SessionStart({ source: 'resume', session_id: 'sess-2' })
    expect(await ui.find({ key: 'resume' })).toBeDefined()
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

// Pause and shutdown across sessions (0.9.4): each session's sign of life in the state file, and the request one
// session writes for all of them. The other sessions stand in the state file as their signs of life.
describe('pause and shutdown across sessions', () => {
  const T0 = 20_000_000
  const REQUEST = 'C:/Users/test/.claude/cache-weather-and-pause-resume/request.json'
  const SESSIONS_TOOL = 'mcp__cache-weather-and-pause-resume__pause_sessions'
  const WHOAMI = 'C:\\Windows\\System32\\whoami.exe'
  const live = (over: Record<string, unknown> = {}) => ({
    seenAt: T0,
    folder: 'repo-b',
    phase: 'running',
    workingSince: null,
    runs: [],
    isAwaitingPerson: false,
    requestId: null,
    ...over,
  })
  const foreign = (over: Record<string, unknown> = {}) => ({
    id: 'b2-1',
    kind: 'shutdown',
    by: 'b2',
    byFolder: 'repo-b',
    // Decided after this session started: one opened later was no part of it.
    at: T0 + 1_000,
    state: 'decided',
    decidedAt: T0 + 1_000,
    decisions: {},
    countdownUntil: null,
    ...over,
  })
  const state = (files: Record<string, string>) => JSON.parse(files[STATE] ?? '{}')
  // Another session writes its sign of life: the entry in the state file, the others kept.
  const signOfLife = (files: Record<string, string>, id: string, entry: Record<string, unknown>) => {
    const now = state(files)
    files[STATE] = JSON.stringify({ ...now, liveSessions: { ...(now.liveSessions ?? {}), [id]: entry } })
  }

  // The sessions overview (0.10.0): a button of the band opens a pane with every session that runs the mod.
  const PANE = {
    plugin: 'cache-weather-and-pause-resume',
    component: 'Pane',
    requestId: 'sessions',
    props: { title: 'Sitzungen', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as const

  test('the sessions button opens the overview: each session with its state, context, cache, keep-warm, model and runs', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: T0 })
    const files = disk(on)
    engine(on)
    const opened: string[] = []
    on('ui.open', ($, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await terminal.find({ key: 'sessions' }))?.props.label).toBe('Sitzungen')
    await terminal.unmount()
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await band.find({ key: 'sessions' }))?.props.label).toBe('⧉ Sitzungen')
    await $.classic.SessionStart({ source: 'startup', session_id: 'a1' })
    signOfLife(
      files,
      'b2b2b2b2-9',
      live({
        workingSince: T0 - 18 * 60_000,
        runs: ['Suite'],
        contextPercent: 42,
        thresholdPercent: 97,
        cacheUntil: T0 + 30 * 60_000,
        keepWarm: true,
        model: 'claude-opus-5-5',
      }),
    )
    await band.press({ key: 'sessions' })
    expect(opened).toEqual(['sessions'])
    await band.unmount()

    const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await pane.find({ type: 'Text', text: /^repo-b$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^arbeitet seit 18 min$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^Ctx 42 % \/ 97 % {2}· {2}Cache 30 m {2}· {2}Keep-warm an {2}· {2}claude-opus-5-5$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /^Lauf: Suite$/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /· diese Sitzung$/ })).toBeDefined()
    // A session gone quiet a minute and a half ago drops out at the next look.
    await clock.advance(105_000)
    expect(await pane.find({ type: 'Text', text: /^repo-b$/ })).toBeUndefined()
    await pane.unmount()
  })

  test('each session writes its sign of life every 15 seconds', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: T0 })
    const files = disk(on)
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'a1' })
    await clock.advance(15_000)
    expect(state(files).liveSessions.a1).toMatchObject({ seenAt: T0 + 15_000, phase: 'running', runs: [], workingSince: null })
    await $.turn.start({ text: 'baue das Feature', turnId: 't1' })
    await clock.advance(15_000)
    expect(state(files).liveSessions.a1.workingSince).toBe(T0 + 15_000)
    await ui.unmount()
  })

  test('a request decided before the session started is no concern of it', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: T0 })
    disk(on, { [REQUEST]: JSON.stringify(foreign({ at: T0 - 60_000, decidedAt: T0 - 60_000 })) })
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'a1' })
    await clock.advance(30_000)
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    await ui.unmount()
  })

  test('an idle session paused from elsewhere counts as paused at once, and picks up with it without a prompt', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: T0 })
    const files = disk(on, { [REQUEST]: JSON.stringify(foreign()) })
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'a1' })
    await clock.advance(15_000)
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Pausiert seit < 1 min · aus repo-b$/ })).toBeDefined()
    expect(prompts).toEqual([])
    expect(state(files).liveSessions.a1).toMatchObject({ phase: 'paused', requestId: 'b2-1' })

    files[REQUEST] = JSON.stringify(foreign({ state: 'resumed' }))
    await clock.advance(15_000)
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    expect(prompts).toEqual([])
    await ui.unmount()
  })

  test('a session at work paused from elsewhere asks nothing, ends its runs as answered, and turns dialogs away', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: T0 })
    const session = mock.session(on)
    disk(on, { [REQUEST]: JSON.stringify(foreign({ decisions: { a1: 'end' } })) })
    engine(on)
    on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'asked' }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'a1' })
    await $.turn.start({ text: 'baue das Feature', turnId: 't1' })
    await clock.advance(15_000)
    const row = JSON.stringify(session.appended().at(-1)?.message.content)
    expect(row).toContain('Pause aus der Sitzung in repo-b')
    expect(row).toContain('Beende deine laufenden Hintergrund-Tasks jetzt')
    expect(await ui.find({ type: 'Text', text: /Shutdown wird vorbereitet … · aus repo-b$/ })).toBeDefined()
    const asked = await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    expect(JSON.stringify(asked)).toContain('Stell jetzt keine Frage')
    await ui.unmount()
  })

  test('a shutdown asks about the sessions at work, waits for the runs it was told to, then counts down', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: T0 })
    const files = disk(on, {}, { OS: 'Windows_NT' })
    const prompts = engine(on)
    on('process.run', ($, e) => ({
      value: {
        exitCode: 0,
        stdout: e.argv[0] === WHOAMI ? 'SeShutdownPrivilege   Herunterfahren des Systems   Deaktiviert' : '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }))
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'a1' })
    await clock.settle()
    signOfLife(files, 'b2b2b2b2-9', live({ seenAt: T0, workingSince: T0 - 18 * 60_000, runs: ['Suite'] }))

    await ui.press({ key: 'shutdown' })
    const asked = prompts.at(-1)?.text ?? ''
    expect(asked).toContain('Andere Sitzungen auf diesem Rechner')
    expect(asked).toContain('b2b2b2b2 (repo-b): Claude arbeitet seit 18 min; 1 Lauf im Hintergrund: Suite')
    expect(JSON.parse(files[REQUEST] ?? '{}').state).toBe('open')

    const answered = await $.tool.call({ tool: SESSIONS_TOOL, sessions: [{ session: 'b2b2b2b2', action: 'wait' }] } as never)
    expect(JSON.stringify(answered)).toContain('the shutdown waits')
    const request = JSON.parse(files[REQUEST] ?? '{}')
    expect(request).toMatchObject({ state: 'decided', decisions: { 'b2b2b2b2-9': 'wait' } })

    // This session has paused; the other one still runs its suite: the shutdown waits for it.
    await $.classic.Stop(stop(undefined, 'a1'))
    expect(await ui.find({ type: 'Text', text: /^Shutdown wartet auf 1 Sitzung: repo-b$/ })).toBeDefined()
    expect(await ui.find({ key: 'shutdown-cancel' })).toBeDefined()
    // The other session took the request up and runs its suite for 16 minutes, writing its sign of life meanwhile:
    // told to wait, it is waited for past 15 minutes.
    let at = T0
    for (let step = 0; step < 64; step += 1) {
      signOfLife(files, 'b2b2b2b2-9', live({ seenAt: at, phase: 'pausing', runs: ['Suite'], requestId: request.id }))
      await clock.advance(15_000)
      at += 15_000
    }
    expect(await ui.find({ type: 'Text', text: /^Shutdown wartet auf 1 Sitzung: repo-b$/ })).toBeDefined()

    signOfLife(files, 'b2b2b2b2-9', live({ seenAt: at, phase: 'paused', requestId: request.id }))
    await clock.advance(15_000)
    expect(await ui.find({ type: 'Text', text: /^Shutdown in 5:00$/ })).toBeDefined()
    expect(JSON.parse(files[REQUEST] ?? '{}').state).toBe('countdown')

    // Cancelled: the shutdown is off for all, the pauses stay; „Weiter“ then picks them all back up.
    await ui.press({ key: 'shutdown-cancel' })
    expect(JSON.parse(files[REQUEST] ?? '{}').state).toBe('cancelled')
    await ui.press({ key: 'resume' })
    expect(JSON.parse(files[REQUEST] ?? '{}').state).toBe('resumed')
    await ui.unmount()
  })

  test('a pause asks whether the sessions at work pause too; kept to its own session, the others go on', DE, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: T0 })
    const files = disk(on)
    const prompts = engine(on)
    on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: 'asked' }))
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'a1' })
    await clock.settle()
    signOfLife(files, 'b2b2b2b2-9', live({ runs: ['Build'] }))
    signOfLife(files, 'c3c3c3c3-9', live({ folder: 'repo-c' }))

    await ui.press({ key: 'pause' })
    const asked = prompts.at(-1)?.text ?? ''
    expect(asked).toContain('ob diese Sitzungen mitpausieren sollen')
    expect(asked).toContain('b2b2b2b2 (repo-b)')
    // An idle session is not listed: it has nothing to decide.
    expect(asked).not.toContain('repo-c')
    // The pause's own question is still open.
    expect(JSON.stringify(await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never))).toContain('asked')

    await $.tool.call({ tool: SESSIONS_TOOL, pauseOthers: false, sessions: [] } as never)
    expect(JSON.parse(files[REQUEST] ?? '{}').state).toBe('withdrawn')
    expect(JSON.stringify(await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never))).toContain('Stell jetzt keine Frage')
    await ui.unmount()
  })
})

// Several sessions write the one state file, each by reading, changing and writing it whole (0.9.2).
describe('the state file, shared by sessions', () => {
  const AT = 7_000_000
  const state = (files: Record<string, string>): Record<string, unknown> => JSON.parse(files[STATE] ?? '{}')

  async function started($: Engine, on: On, seed: Record<string, string> = {}) {
    mock.store(on)
    const clock = mock.clock(on, { now: AT })
    const files = disk(on, seed)
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'w1' })
    return { clock, files, ui }
  }

  test('keys of earlier versions go with the next write; everything else stays', DE_COLD, async ($, on) => {
    const old = { isCollapsed: false, keepAliveSessions: { x: 1 }, ttlMinutes: 60, pausedSessions: { other: 5 } }
    const { files, ui } = await started($, on, { [STATE]: JSON.stringify(old) })
    await ui.press({ key: 'keep-warm' })
    const now = state(files)
    expect(now.isCollapsed).toBeUndefined()
    expect(now.keepAliveSessions).toBeUndefined()
    expect(now.ttlMinutes).toBe(60)
    expect(now.pausedSessions).toEqual({ other: 5 })
    expect(now.keepWarmSessions).toEqual({ w1: AT })
    await ui.unmount()
  })

  test('a change another session’s write took back goes in again, beside that session’s own', DE_COLD, async ($, on) => {
    const { clock, files, ui } = await started($, on)
    await ui.press({ key: 'keep-warm' })
    expect(state(files).keepWarmSessions).toEqual({ w1: AT })
    // Another session read the file before that write and writes after it: the switch is gone, its pause is in.
    files[STATE] = JSON.stringify({ pausedSessions: { other: 5 } })
    await clock.advance(300)
    expect(state(files).keepWarmSessions).toEqual({ w1: AT })
    expect(state(files).pausedSessions).toEqual({ other: 5 })
    // Once the change stands, the checks end: nothing is written again.
    const settled = files[STATE]
    await clock.advance(2_000)
    expect(files[STATE]).toBe(settled)
    await ui.unmount()
  })

  test('a half-written file is read again, not written over', DE_COLD, async ($, on) => {
    const { clock, files, ui } = await started($, on)
    files[STATE] = '{\n  "pausedSessions": {\n    "other": 5'
    await ui.press({ key: 'keep-warm' })
    expect(files[STATE]).toBe('{\n  "pausedSessions": {\n    "other": 5')
    files[STATE] = JSON.stringify({ pausedSessions: { other: 5 } })
    await clock.advance(200)
    expect(state(files).pausedSessions).toEqual({ other: 5 })
    expect(state(files).keepWarmSessions).toEqual({ w1: AT })
    await ui.unmount()
  })

  test('a file that stays broken through every try is written anew', DE_COLD, async ($, on) => {
    const { clock, files, ui } = await started($, on)
    files[STATE] = 'not json'
    await ui.press({ key: 'keep-warm' })
    await clock.advance(400)
    expect(files[STATE]).toBe('not json')
    await clock.advance(1_000)
    expect(state(files).keepWarmSessions).toEqual({ w1: AT })
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

describe('keep-warm', () => {
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
    on('classic.Notification', () => ({}))
    return { prompts, logs }
  }

  // A session resumed `ago` milliseconds after its last response, with the given cache lifetime.
  async function resumed($: Engine, ago: number, ttl: '5m' | '1h'): Promise<void> {
    await $.classic.SessionStart({ source: 'resume', session_id: 'k1', seconds_since_last_response: ago / 1000 })
    await $.classic.PostModelSwitch({ cache_ttl: ttl })
  }

  test('the checkbox is the person’s alone: switched by a press, kept on disk for this session (option off)', DE_COLD, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    const files = disk(on)
    engine(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 's1' })
    expect((await terminal.find({ key: 'keep-warm' }))?.props.label).toBe('[ ] Keep-warm')
    await terminal.press({ key: 'keep-warm' })
    expect((await terminal.find({ key: 'keep-warm' }))?.props.label).toBe('[✓] Keep-warm')
    expect(JSON.parse(files[STATE] ?? '{}').keepWarmSessions).toEqual({ s1: START })
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await desktop.find({ key: 'keep-warm' }))?.props.label).toBe('☑ Keep-warm')
    await desktop.press({ key: 'keep-warm' })
    expect(JSON.parse(files[STATE] ?? '{}').keepWarmSessions).toEqual({})
    expect(JSON.parse(files[STATE] ?? '{}').keepWarmOffSessions).toEqual({ s1: START })
    await terminal.unmount()
    await desktop.unmount()
  })

  test('by default a new session starts with keep-warm; switched off, that session keeps it off', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on)
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'd1' })
    expect((await ui.find({ key: 'keep-warm' }))?.props.label).toBe('[✓] Keep-warm')
    await ui.press({ key: 'keep-warm' })
    await $.classic.SessionStart({ source: 'clear', session_id: 'd2' })
    expect((await ui.find({ key: 'keep-warm' }))?.props.label).toBe('[✓] Keep-warm')
    await $.classic.SessionStart({ source: 'resume', session_id: 'd1' })
    expect((await ui.find({ key: 'keep-warm' }))?.props.label).toBe('[ ] Keep-warm')
    await ui.unmount()
  })

  test('a session resumed keeps its switch; another one, and the one after /clear, start without (option off)', DE_COLD, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'resume', session_id: 'k1' })
    expect((await ui.find({ key: 'keep-warm' }))?.props.label).toBe('[✓] Keep-warm')
    await $.classic.SessionStart({ source: 'clear', session_id: 'k2' })
    expect((await ui.find({ key: 'keep-warm' }))?.props.label).toBe('[ ] Keep-warm')
    await ui.unmount()
  })

  test('off, nothing is refreshed', { ...DE_COLD, timeoutMs: 30_000 }, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on)
    engine(on)
    const asked = forks(on)
    await resumed($, 2 * MIN, '1h')
    await clock.advance(2 * HOUR)
    expect(asked.prompts.length).toBe(0)
  })

  // Usage windows (0.10.0): shown in the status row from 80 %; keep-warm stops from 90 % and goes on once it drops.
  test('a usage window at 92 % stands in the status row and stops keep-warm until it starts over', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 2 * MIN, '1h')
    const resetsAt = new Date(START + 3 * HOUR).toISOString()
    const at = new Date(START + 3 * HOUR)
    const clockText = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    const sameDay = new Date(START).toDateString() === at.toDateString()
    const measure = (percentUsed: number) =>
      $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt }], changed: ['rateLimits'] } as never)

    await measure(84)
    const shown = sameDay ? `5-h-Limit 84 % · neu um ${clockText}` : `5-h-Limit 84 %`
    expect(await ui.find({ type: 'Text', text: new RegExp(`^${shown}`) })).toBeDefined()

    await measure(92)
    await clock.advance(55 * MIN)
    expect(asked.prompts.length).toBe(0)
    expect(await ui.find({ type: 'Text', text: /^Keep-warm: hält an, Kontingent bei 92 %$/ })).toBeDefined()
    expect(asked.logs.filter(line => line.includes('hält an')).length).toBe(1)

    // The window starts over: keep-warm refreshes before the cache lapses.
    await measure(3)
    await clock.advance(30_000)
    expect(asked.prompts.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /5-h-Limit/ })).toBeUndefined()
    await ui.unmount()
  })

  test('the option keepWarmHours sets how long the hour cache is kept warm in a quiet session', { options: { language: 'de', keepWarmHours: 1 }, timeoutMs: 30_000 }, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 2 * MIN, '1h')
    await clock.advance(53 * MIN)
    expect(asked.prompts.length).toBe(1)
    // The next refresh would come past the hour since the last input: keep-warm ends there.
    await clock.advance(56 * MIN)
    expect(asked.prompts.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /^Keep-warm: endete nach 1 h ohne Eingabe$/ })).toBeDefined()
    await ui.unmount()
  })

  test('back after refreshes, the first request that reads the cache draws keep-warm’s balance', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    on('turn.step', async function* ($, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: 'Weiter.',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { input_tokens: 40, output_tokens: 300, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 0 },
      }
    } as never)
    // A resumed session names its model before any request of its own: the refresh is priced on it too.
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 2 * MIN, '1h')
    await clock.advance(53 * MIN)
    expect(asked.prompts.length).toBe(1)
    // The person is back: a turn of the conversation's own reads the cache on Opus 5.5.
    await $.turn.start({ text: 'weiter geht es', turnId: 't9' })
    const step = $.turn.step({ turnId: 't9', index: 0, model: 'claude-opus-5-5' } as never) as unknown as AsyncIterable<unknown>
    for await (const _ of step) {
      // drained
    }
    // 1 refresh: 150.000 × 0,05 + 30 + 2 × 5 = 7.540; the rebuild 150.000 × 2 = 300.000; paid 7.540 + 7.500.
    expect(asked.logs.at(-1)).toBe(
      '↻ Keep-warm-Bilanz: 1 Auffrischung kostete so viel wie 7.540 Input-Tokens; der ersparte Neuaufbau des Caches hätte 300.000 gekostet. Gespart: ≈ 95 %.',
    )
    await ui.unmount()
  })

  test('the status row says about how many turns are left until auto-compact, from ten on', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on)
    engine(on)
    on('turn.complete', () => ({ text: '' }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    // The session's own threshold: 160.000 of 200.000 tokens, 80 %.
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { window: 200_000, percent: 50, tokens: 100_000, breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 160_000 } },
        rateLimits: [],
      },
    }))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'f1' })
    await $.classic.Stop(stop(undefined, 'f1'))
    let turn = 0
    const turnEndingAt = async (tokens: number) => {
      turn += 1
      await $.turn.start({ text: `Schritt ${turn}`, turnId: `t${turn}` })
      await $.session.measure({ context: { window: 200_000, tokens, percent: Math.round(tokens / 2_000) }, rateLimits: [], changed: ['context'] } as never)
      await $.turn.complete({ turnId: `t${turn}`, reason: 'answer', answer: 'Erledigt.' } as never)
    }
    await turnEndingAt(60_000)
    await turnEndingAt(70_000)
    await turnEndingAt(80_000)
    // Two turns of growth: not yet.
    expect(await ui.find({ type: 'Text', text: /Auto-Compact/ })).toBeUndefined()
    await turnEndingAt(90_000)
    // 70.000 left at 10.000 a turn: seven, more than nothing yet but within ten.
    expect(await ui.find({ type: 'Text', text: /^Auto-Compact in ≈ 7 Zügen$/ })).toBeDefined()
    await turnEndingAt(140_000)
    // A large turn (50.000) moves the median little: 20.000 left at 10.000, two.
    expect(await ui.find({ type: 'Text', text: /^Auto-Compact in ≈ 2 Zügen$/ })).toBeDefined()
    await ui.unmount()
  })

  test('the hour cache is refreshed five minutes before it lapses, and counts down afresh', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 2 * MIN, '1h')

    await clock.advance(52 * MIN)
    expect(asked.prompts.length).toBe(0)
    await clock.advance(MIN)
    expect(asked.prompts.length).toBe(1)
    expect(asked.prompts[0]).toContain('keep-warm')
    expect(asked.logs.at(-1)).toBe('↻ Keep-warm: Cache aufgefrischt (150.000 Tokens aus dem Cache gelesen, 2 Tokens Antwort)')
    expect(await ui.find({ type: 'Text', text: /^Cache 60 m/ })).toBeDefined()
    expect((await ui.find({ key: 'keep-warm' }))?.props.label).toBe('☑ Keep-warm ↻1')

    await clock.advance(55 * MIN)
    expect(asked.prompts.length).toBe(2)
    await ui.unmount()
  })

  test('while Claude works there is no limit', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    await resumed($, 0, '5m')
    await $.turn.start({ text: 'die lange Suite', turnId: 't1' })

    await clock.advance(HOUR)
    // Every 4 minutes, past the 45 minutes an idle session gets.
    expect(asked.prompts.length).toBe(15)
  })

  test('Claude waiting for a permission prompt counts as idle, not as work', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    await resumed($, 0, '5m')
    await $.turn.start({ text: 'baue das Feature', turnId: 't1' })
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })

    await clock.advance(HOUR)
    // As idle: at 4, 8, … 44 minutes, then no more.
    expect(asked.prompts.length).toBe(11)
  })

  // A model switch that forfeits a warm cache says what it costs (0.10.0), with Claude Code's own estimate.
  test('a switch of model with the cache warm says what writing it again costs; with it cold, nothing', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on)
    engine(on)
    const asked = forks(on)
    await resumed($, 2 * MIN, '1h')
    const switched = (warm: boolean) =>
      $.classic.PostModelSwitch({
        cache_ttl: '1h',
        from_model: 'claude-opus-5-5',
        to_model: 'claude-sonnet-5-5',
        prompt_cache_warm: warm,
        context_tokens: 180_000,
        estimated_cache_write_usd: 0.72,
        pricing: 'catalog',
      } as never)
    await switched(true)
    expect(asked.logs.at(-1)).toBe(
      'Modellwechsel auf claude-sonnet-5-5: Der warme Cache des bisherigen Modells verfällt, die nächste Anfrage schreibt 180.000 Tokens neu in den Cache, ≈ 0,72 $ (Listenpreis).',
    )
    const before = asked.logs.length
    await switched(false)
    expect(asked.logs.length).toBe(before)
  })

  test('after a switch to another model there is nothing to keep warm until the next request', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await resumed($, 2 * MIN, '1h')
    await $.classic.PostModelSwitch({ cache_ttl: '1h', from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5' })

    await clock.advance(HOUR)
    expect(asked.prompts.length).toBe(0)
    expect(await ui.find({ type: 'Text', text: /^Keep-warm: wartet auf die nächste Anfrage$/ })).toBeDefined()
    await ui.unmount()
  })

  // The status row (0.9.3): one row per message under the bar, the most pressing first, and none while there is
  // nothing to say; the toasts that only repeated a state are gone.
  test('the status row holds one row per message, and counts the pause up', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    forks(on)
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await resumed($, 2 * MIN, '1h')
    expect(await ui.find({ type: 'Text', text: /^(Pausiert|Keep-warm:|Pause wird)/ })).toBeUndefined()

    await $.classic.PostModelSwitch({ cache_ttl: '1h', from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5' })
    expect(await ui.find({ type: 'Text', text: /^Keep-warm: wartet auf die nächste Anfrage$/ })).toBeDefined()
    await ui.press({ key: 'pause' })
    expect(await ui.find({ type: 'Text', text: /^❚❚ Pause wird vorbereitet …$/ })).toBeDefined()
    await $.classic.Stop(stop(undefined, 'k1'))
    expect(await ui.find({ key: 'resume' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Pausiert seit < 1 min$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Keep-warm: wartet auf die nächste Anfrage$/ })).toBeDefined()
    expect(toasts).toEqual([])

    await clock.advance(12 * MIN)
    expect(await ui.find({ type: 'Text', text: /^Pausiert seit 12 min$/ })).toBeDefined()
    await clock.advance(63 * MIN)
    expect(await ui.find({ type: 'Text', text: /^Pausiert seit 1 h 15 min$/ })).toBeDefined()
    await ui.unmount()
  })

  test('„Weiter“ while the pause is prepared calls it off', DE, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: START })
    disk(on)
    const prompts = engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await $.classic.SessionStart({ source: 'startup', session_id: 'p1' })
    expect((await ui.find({ type: 'Svg' }))?.props.height).toBe(10)
    await ui.press({ key: 'pause' })
    expect(await ui.find({ type: 'Text', text: /^⏳ Pause wird vorbereitet …$/u })).toBeDefined()
    // Above the status row the bar keeps as much room below it as above.
    expect((await ui.find({ type: 'Svg' }))?.props.height).toBe(16)
    await ui.press({ key: 'pause-cancel' })
    expect(prompts.at(-1)?.text).toBe('weitermachen')
    expect(await ui.find({ key: 'pause' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Pause wird vorbereitet/ })).toBeUndefined()
    await ui.unmount()
  })

  test('the five-minute cache is refreshed a minute before it lapses, for 45 minutes', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await resumed($, 0, '5m')

    await clock.advance(HOUR)
    // At 4, 8, … 44 minutes; the one due at 48 is past the 45 minutes. (The hour cache's 8 hours: the logic's tests.)
    expect(asked.prompts.length).toBe(11)
    expect(await ui.find({ type: 'Text', text: /^Keep-warm: endete nach 45 m ohne Eingabe$/ })).toBeDefined()
    expect(asked.logs.some(line => line.includes('nach 45 m ohne Eingabe nicht weiter aufgefrischt'))).toBe(true)
    // What the unused refreshes cost (0.10.0): 11 × (150.000 × 0,1 + 30 + 2 × 5).
    expect(asked.logs.at(-1)).toContain('11 Auffrischungen kosteten so viel wie 165.440 Input-Tokens')
    // The checkbox stays as the person set it.
    expect((await ui.find({ key: 'keep-warm' }))?.props.label).toMatch(/^☑ Keep-warm/)
    await ui.unmount()
  })

  test('switching it off and on clears the note; with the cache gone it waits for the next request', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await resumed($, 0, '5m')
    await clock.advance(HOUR)
    expect(asked.prompts.length).toBe(11)

    await ui.press({ key: 'keep-warm' })
    await ui.press({ key: 'keep-warm' })
    expect(await ui.find({ type: 'Text', text: /ohne Eingabe/ })).toBeUndefined()
    await clock.advance(HOUR)
    expect(asked.prompts.length).toBe(11)
    await ui.unmount()
  })

  test('a refresh that finds the cache gone stops until the next request, and says so', SLOW, async ($, on) => {
    mock.store(on)
    const clock = mock.clock(on, { now: START })
    disk(on, { [STATE]: JSON.stringify({ keepWarmSessions: { k1: 1 } }) })
    engine(on)
    const asked = forks(on, COLD)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    await resumed($, 2 * MIN, '1h')

    await clock.advance(2 * HOUR)
    expect(asked.prompts.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /^Keep-warm: Cache war schon abgelaufen$/ })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /%/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Ctx/ })).toBeUndefined()
    expect(await ui.find({ key: 'keep-warm' })).toBeDefined()
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
    expect(await ui.find({ type: 'Text', text: /Preparing the pause/ })).toBeDefined()

    await $.classic.Stop(stop('running'))
    expect(await ui.find({ type: 'Text', text: /1 task still running/ })).toBeDefined()
    await $.classic.Stop(stop())
    expect(await ui.find({ key: 'resume' })).toBeDefined()

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
