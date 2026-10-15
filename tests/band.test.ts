import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  cacheTone,
  chunkSummary,
  compactionLines,
  hitRate,
  isWarmRead,
  keepWarmSpanText,
  keepWarmStep,
  lastResponseFromTranscript,
  lifetimeFromResume,
  pauseSigns,
  remainingMinutes,
  remainingShare,
  svgBar,
  terminalBar,
  terminalWeather,
  thresholdPercent,
  ttlFromTranscript,
  weather,
} from '../hooks/logic'

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
    expect(pauseSigns(true)).toEqual({ pause: '❚❚', resume: '►', requested: '❚❚' })
    expect(pauseSigns(false)).toEqual({ pause: '⏸', resume: '▶', requested: '⏳' })
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
      expect(await ui.find({ type: 'Text', text: /Ctx – \/ Max 83 %/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Hits / })).toBeDefined()
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
    expect((await terminal.find({ key: 'pause' }))?.props.label).toBe('❚❚ Pause')
    expect((await terminal.find({ type: 'Text', text: /^☼$/ }))?.props.color).toBe('warning')
    expect(await terminal.find({ type: 'Text', text: /️|[☀🌧⛈⏸⏳▶]/u })).toBeUndefined()
    await terminal.unmount()

    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
    expect((await desktop.find({ key: 'pause' }))?.props.label).toBe('⏸ Pause')
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
