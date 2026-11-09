import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  cacheReadRatio,
  cacheTone,
  cacheWriteRatio,
  chunkSummary,
  compactionLines,
  hitRate,
  isWarmRead,
  keepWarmBalance,
  keepWarmHoursOf,
  keepWarmSpanText,
  keepWarmStep,
  lastResponseFromTranscript,
  lifetimeFromResume,
  median,
  pauseSigns,
  refreshCost,
  remainingMinutes,
  remainingShare,
  resetClock,
  svgBar,
  terminalBar,
  terminalWeather,
  thresholdPercent,
  ttlFromTranscript,
  turnsToCompact,
  usageStopping,
  usageToShow,
  weather,
  withGrowth,
} from '../hooks/logic'

// The context forecast (0.10.0): the median growth of the last five turns, from three turns on.
describe('the context forecast', () => {
  test('the median moves little for one large turn; a shrinking turn adds nothing; five are kept', async () => {
    expect(median([10, 90, 12])).toBe(12)
    expect(median([10, 20])).toBe(15)
    expect(median([])).toBeNull()
    expect(withGrowth([1, 2], -5000)).toEqual([1, 2])
    expect(withGrowth([1, 2, 3, 4, 5], 6)).toEqual([2, 3, 4, 5, 6])
  })

  test('turns until the threshold: none before three turns, at least one', async () => {
    expect(turnsToCompact(130_000, 160_000, [10_000, 10_000])).toBeNull()
    expect(turnsToCompact(130_000, 160_000, [10_000, 10_000, 10_000])).toBe(3)
    // One file read of 60.000 tokens hardly moves it.
    expect(turnsToCompact(130_000, 160_000, [10_000, 60_000, 10_000])).toBe(3)
    expect(turnsToCompact(158_000, 160_000, [10_000, 10_000, 10_000])).toBe(1)
    expect(turnsToCompact(170_000, 160_000, [10_000, 10_000, 10_000])).toBe(1)
    expect(turnsToCompact(null, 160_000, [10_000, 10_000, 10_000])).toBeNull()
  })
})

// Keep-warm's balance (0.10.0): in input tokens' worth, at each model's cache read price.
describe('keep-warm’s balance', () => {
  test('a cache read costs a tenth of the input, on Opus 5.5 a twentieth, on Fable and Mythos 5.1 a fortieth', async () => {
    expect(cacheReadRatio('claude-sonnet-5-5')).toBe(0.1)
    expect(cacheReadRatio('claude-opus-5-5[1m]')).toBe(0.05)
    expect(cacheReadRatio('claude-fable-5-1')).toBe(0.025)
    expect(cacheReadRatio('claude-mythos-5-1')).toBe(0.025)
    expect(cacheReadRatio('claude-unknown-9')).toBe(0.1)
    expect(cacheReadRatio(null)).toBe(0.1)
    expect(cacheWriteRatio(5)).toBe(1.25)
    expect(cacheWriteRatio(60)).toBe(2)
  })

  test('a refresh costs its read, its fresh input and its answer; the balance sets the refreshes against the rebuild', async () => {
    const warm = { input_tokens: 30, output_tokens: 2, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 0 }
    expect(refreshCost(warm, 0.05, 2)).toBe(7_540)
    // Three refreshes on Opus 5.5 and the hour's cache, then a request reads 150.000 tokens from the cache.
    const balance = keepWarmBalance({ spent: 3 * 7_540, readTokens: 150_000, readRatio: 0.05, writeRatio: 2 })
    expect(balance?.rebuild).toBe(300_000)
    expect(Math.round((balance?.savedShare ?? 0) * 100)).toBe(90)
    // Many refreshes for a small cache cost more than its rebuild: below 0.
    expect((keepWarmBalance({ spent: 400_000, readTokens: 150_000, readRatio: 0.1, writeRatio: 2 })?.savedShare ?? 0) < 0).toBe(true)
    // A request that read nothing from the cache spared nothing.
    expect(keepWarmBalance({ spent: 10, readTokens: 0, readRatio: 0.1, writeRatio: 2 })).toBeNull()
  })
})

// The usage windows (0.10.0): shown from 80 %, red from 95 %, keep-warm stops from 90 %.
describe('the usage windows', () => {
  test('from 80 % on, fullest first; red from 95 %; keep-warm stops from 90 %', async () => {
    const windows = [
      { kind: 'seven_day', percentUsed: 81 },
      { kind: 'five_hour', percentUsed: 96.5 },
      { kind: 'spend_limit', percentUsed: 40 },
    ]
    expect(usageToShow(windows).map(({ reading, tone }) => [reading.kind, tone])).toEqual([
      ['five_hour', 'error'],
      ['seven_day', 'warning'],
    ])
    expect(usageToShow([{ kind: 'five_hour', percentUsed: 79.9 }])).toEqual([])
    expect(usageStopping(windows)?.kind).toBe('five_hour')
    expect(usageStopping([{ kind: 'five_hour', percentUsed: 89 }])).toBeNull()
    expect(usageStopping([{ kind: 'seven_day', percentUsed: 90 }])?.kind).toBe('seven_day')
  })

  test('the reset as a clock time, with the weekday where it is not today', async () => {
    const now = new Date(2026, 10, 9, 12, 30).getTime()
    expect(resetClock(new Date(2026, 10, 9, 15, 0).toISOString(), now, 'de')).toBe('15:00')
    expect(resetClock(new Date(2026, 10, 16, 9, 5).toISOString(), now, 'de')).toBe('Mo 09:05')
    expect(resetClock(new Date(2026, 10, 16, 9, 5).toISOString(), now, 'en')).toBe('Mon 09:05')
    expect(resetClock(undefined, now, 'de')).toBeNull()
    expect(resetClock('not a time', now, 'de')).toBeNull()
  })
})

const BAND = {
  plugin: 'cache-weather-and-pause-resume',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

describe('the cache countdown', () => {
  test('runs empty over the lifetime, green then yellow then red', async () => {
    const start = 1_000_000
    expect(remainingShare(start, 60, start)).toBe(1)
    expect(remainingShare(start, 60, start + 30 * 60_000)).toBe(0.5)
    expect(remainingShare(start, 5, start + 10 * 60_000)).toBe(0)
    expect(remainingShare(null, 60, start)).toBeNull()
    expect(remainingMinutes(start, 60, start + 59 * 60_000 + 1)).toBe(1)
    expect(remainingMinutes(start, 60, start + 60 * 60_000)).toBe(0)
    expect(cacheTone(0.61)).toBe('success')
    expect(cacheTone(0.6)).toBe('warning')
    expect(cacheTone(0.21)).toBe('warning')
    expect(cacheTone(0.2)).toBe('error')
  })

  test('the terminal bar spans the band and keeps one cell lit until the end', async () => {
    expect(terminalBar(1, 80)).toEqual({ lit: '━'.repeat(80), spent: '' })
    expect(terminalBar(0.5, 80)).toEqual({ lit: '━'.repeat(40), spent: '─'.repeat(40) })
    expect(terminalBar(0.001, 80)).toEqual({ lit: '━', spent: '─'.repeat(79) })
    expect(terminalBar(0, 80)).toEqual({ lit: '', spent: '─'.repeat(80) })
    expect(terminalBar(null, 80)).toEqual({ lit: '', spent: '─'.repeat(80) })
  })

  test('the picture bar is a grey track, lit in the cache colour for what is left', async () => {
    expect(svgBar(0.5)).toContain('<rect y="6" height="4" width="2000" fill="#f5a524"/>')
    expect(svgBar(0.5)).toContain('height="10" viewBox="0 0 4000 10"')
    expect(svgBar(0.9)).toContain('fill="#30a46c"')
    expect(svgBar(0.1)).toContain('fill="#e5484d"')
    expect(svgBar(0)).not.toContain('#e5484d')
    expect(svgBar(null)).toContain('preserveAspectRatio="none"')
    // Above a status row the picture keeps as much room below the bar as above it (0.9.3).
    expect(svgBar(0.5, true)).toContain('height="16" viewBox="0 0 4000 16"')
    expect(svgBar(0.5, true)).toContain('<rect y="6" height="4" width="2000" fill="#f5a524"/>')
  })
})

describe('keep-warm', () => {
  const MIN = 60_000
  const at = (minutes: number, over: Partial<Parameters<typeof keepWarmStep>[0]> = {}) =>
    keepWarmStep({ cacheUsedAt: 0, activeAt: 0, ttlMinutes: 60, isWorking: false, now: minutes * MIN, ...over })

  test('refreshes the hour cache five minutes before it lapses, the five-minute one a minute before', async () => {
    expect(at(54)).toBe('wait')
    expect(at(55)).toBe('refresh')
    expect(at(60)).toBe('lapsed')
    expect(at(3.9, { ttlMinutes: 5 })).toBe('wait')
    expect(at(4, { ttlMinutes: 5 })).toBe('refresh')
    expect(at(5, { ttlMinutes: 5 })).toBe('lapsed')
    expect(at(55, { cacheUsedAt: null })).toBe('wait')
    expect(at(55, { ttlMinutes: null })).toBe('wait')
  })

  test('an idle session is kept warm 8 hours (hour cache) or 45 minutes (five-minute cache), Claude at work always', async () => {
    expect(at(7 * 60 + 55, { cacheUsedAt: 7 * 60 * MIN })).toBe('refresh')
    expect(at(8 * 60 + 55, { cacheUsedAt: 8 * 60 * MIN })).toBe('ended')
    expect(at(8 * 60 + 55, { cacheUsedAt: 8 * 60 * MIN, isWorking: true })).toBe('refresh')
    expect(at(8 * 60 + 55, { cacheUsedAt: 8 * 60 * MIN, activeAt: 60 * MIN })).toBe('refresh')
    expect(at(44, { ttlMinutes: 5, cacheUsedAt: 40 * MIN })).toBe('refresh')
    expect(at(48, { ttlMinutes: 5, cacheUsedAt: 44 * MIN })).toBe('ended')
    expect(keepWarmSpanText(60)).toBe('8 h')
    expect(keepWarmSpanText(5)).toBe('45 m')
    // The option keepWarmHours (0.10.0): whole hours from 1 to 18, the hour's cache only.
    expect(keepWarmSpanText(60, 16)).toBe('16 h')
    expect(keepWarmSpanText(5, 16)).toBe('45 m')
    expect(at(8 * 60 + 55, { cacheUsedAt: 8 * 60 * MIN, hours: 16 })).toBe('refresh')
    expect(keepWarmHoursOf(undefined)).toBe(8)
    expect(keepWarmHoursOf(16)).toBe(16)
    expect(keepWarmHoursOf('12')).toBe(12)
    expect(keepWarmHoursOf(30)).toBe(18)
    expect(keepWarmHoursOf(0)).toBe(1)
    expect(keepWarmHoursOf('many')).toBe(8)
  })

  test('a refresh counts as warm when nearly all of its input came from the cache', async () => {
    expect(isWarmRead({ input_tokens: 30, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 0 })).toBe(true)
    expect(isWarmRead({ input_tokens: 140_000, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 0 })).toBe(false)
    expect(isWarmRead({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(false)
  })
})

describe('the session readings', () => {
  test('hit rate is the cached share of all input tokens', async () => {
    const rate = hitRate({ input_tokens: 2, cache_read_input_tokens: 332_339, cache_creation_input_tokens: 1_624 }) ?? 0
    expect(Math.abs(rate - 0.9951) < 0.0001).toBe(true)
    expect(hitRate({ input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeNull()
  })

  test('weather follows the share of the auto-compact threshold', async () => {
    expect(weather(41, 83)).toBe('☀️')
    expect(weather(50, 83)).toBe('🌧️')
    expect(weather(67, 83)).toBe('⛈️')
    expect(weather(null, 83)).toBe('☀️')
    expect(terminalWeather('☀️')).toEqual({ sign: '☼', tone: 'warning' })
    expect(terminalWeather('🌧️')).toEqual({ sign: '≋', tone: 'suggestion' })
    expect(terminalWeather('⛈️')).toEqual({ sign: '↯', tone: 'error' })
    // One code point each, none an emoji: every terminal draws them one column wide.
    for (const sign of ['☼', '≋', '↯', '❚', '►']) expect([...sign].length).toBe(1)
    expect(pauseSigns(true)).toEqual({ requested: '❚❚' })
    expect(pauseSigns(false)).toEqual({ requested: '⏳' })
  })

  test('a resumed session tells the lifetime only when its last response is 5 to 60 minutes old', async () => {
    expect(lifetimeFromResume(1200, false)).toBe(60)
    expect(lifetimeFromResume(1200, true)).toBe(5)
    expect(lifetimeFromResume(200, false)).toBeNull()
    expect(lifetimeFromResume(4000, true)).toBeNull()
    expect(lifetimeFromResume(1200, undefined)).toBeNull()
    expect(lifetimeFromResume(undefined, false)).toBeNull()
    expect(thresholdPercent(830_000, 1_000_000)).toBe(83)
    expect(thresholdPercent(undefined, 1_000_000)).toBeNull()
  })

  test('the lifetime is read off the last cache write that wrote anything', async () => {
    const oneHour = '{"type":"assistant","timestamp":"2026-10-12T08:00:00.000Z","message":{"usage":{"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1624}}}}'
    const readOnly = '{"type":"assistant","timestamp":"2026-10-12T08:05:00.000Z","message":{"usage":{"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}}}'
    const fiveMinutes = '{"type":"assistant","message":{"usage":{"cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":900}}}}'
    expect(ttlFromTranscript(`${oneHour}\n${readOnly}\n`)).toBe(60)
    expect(ttlFromTranscript(`${oneHour}\n${fiveMinutes}\n`)).toBe(5)
    expect(ttlFromTranscript('{"type":"user"}')).toBeNull()
    expect(lastResponseFromTranscript(`${oneHour}\n${readOnly}\n{"type":"user"}`)).toBe(Date.parse('2026-10-12T08:05:00.000Z'))
  })
})

describe('the summary in the chat', () => {
  test('long summaries are cut at paragraphs, nothing is lost', async () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Absatz ${i + 1}. ` + 'x'.repeat(400))
    const chunks = chunkSummary(paragraphs.join('\n\n'), 1800)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1800)
    expect(chunks.join('\n\n')).toBe(paragraphs.join('\n\n'))
  })

  test('one overlong paragraph is cut at sentences', async () => {
    const sentence = 'Das ist ein Satz mit etwas Inhalt. '
    const text = sentence.repeat(120).trim()
    const chunks = chunkSummary(text, 500)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500)
      expect(chunk.endsWith('.')).toBe(true)
    }
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '))
  })

  // The engine's test kit hands a compaction no transcript, so the lines are tested on the function the hook logs.
  test('a compaction gives the token line, then the summary Claude goes on with', async () => {
    const summary = 'This session is being continued from a previous conversation.\n\nErster Absatz.'
    const lines = compactionLines(
      [
        { role: 'assistant', text: 'nicht die Zusammenfassung' },
        { role: 'user', text: summary },
      ],
      412_300,
      38_900,
      'de',
    )
    expect(lines[0]).toContain('412.300 → 38.900 Tokens')
    expect(lines.slice(1).join('\n\n')).toBe(summary)

    const text = Array.from({ length: 9 }, () => 'y'.repeat(500)).join('\n\n')
    const long = compactionLines([{ role: 'user', text }], undefined, 9, 'de')
    expect(long[0]).toContain('? → 9 Tokens')
    expect(long[1]?.startsWith('(1/3) ')).toBe(true)
    expect(compactionLines([], 1, 2, 'de')[1]).toBe('(keine Zusammenfassung im Ergebnis)')

    const english = compactionLines([{ role: 'user', text: summary }], 412_300, 38_900, 'en')
    expect(english[0]).toContain('412,300 → 38,900 tokens · the summary Claude carries on with:')
    expect(compactionLines([], 1, 2, 'en')[1]).toBe('(no summary in the result)')
  })
})

// Nothing of another mod beneath the band: the engine's own drawing.
const nothingBeneath = (on: On) => on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))

describe('the band', () => {
  test('draws the cache, the weather and the context, and folds up on every surface', async ($, on) => {
    mock.store(on)
    nothingBeneath(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ type: 'Text', text: /Cache/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Ctx – \/ 83 %\*$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Hits|Max/ })).toBeUndefined()
      expect(await ui.find({ key: 'pause' })).toBeDefined()
      expect(await ui.find({ key: 'compact' })).toBeDefined()
      expect(await ui.find({ key: 'keep-warm' })).toBeDefined()
      // Nothing folds any more (0.8.0).
      expect(await ui.find({ key: 'toggle' })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('a terminal gets narrow signs without emoji, the desktop app its emoji', async ($, on) => {
    mock.store(on)
    nothingBeneath(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await terminal.find({ key: 'pause' }))?.props.label).toBe('Pause')
    expect((await terminal.find({ type: 'Text', text: /^☼$/ }))?.props.color).toBe('warning')
    expect(await terminal.find({ type: 'Text', text: /️|[☀🌧⛈⏸⏳▶]/u })).toBeUndefined()
    await terminal.unmount()

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    // In the desktop app the buttons are one-colour icons, each named by a hint under the pointer (0.10.0).
    expect((await desktop.find({ key: 'pause' }))?.props.label).toBe('⏸︎')
    expect(await desktop.find({ type: 'Text', text: /^Pause: Claude lässt Laufendes zu Ende laufen/ })).toBeDefined()
    // Under the pointer the word appears beside the icon, a plain button that does the same.
    const words = await desktop.find({ key: 'hint-pause-words' })
    expect(words?.props.label).toBe('Pause')
    expect(words?.props.plain).toBe(true)
    expect(await desktop.find({ type: 'Text', text: /^☀️$/u })).toBeDefined()
    await desktop.unmount()
  })

  test('the cache bar has a line of its own: line signs over the band’s width in a terminal, a picture elsewhere', async ($, on) => {
    mock.store(on)
    nothingBeneath(on)
    const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await terminal.find({ type: 'Text', text: /^─{160}$/ })).toBeDefined()
    await terminal.unmount()

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await desktop.find({ type: 'Svg' }))?.props.height).toBe(10)
    await desktop.unmount()
  })

  test('the band of another mod beneath (a progress bar) stays visible under ours', async ($, on) => {
    mock.store(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box, Text, Button } = $.ui.resolve(e)
      return h(Box, {}, h(Text, {}, 'Fortschritt 3/7'), h(Button, { key: 'savvy-agents', label: '×2', onPress: () => {} }))
    })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ key: 'compact' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Fortschritt 3\/7/ })).toBeDefined()
      expect(await ui.find({ key: 'savvy-agents' })).toBeDefined()
      await ui.unmount()
    }
  })
})
