import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  BAR_CELLS,
  cacheBar,
  cacheTone,
  chunkSummary,
  compactionLines,
  hitRate,
  lastResponseFromTranscript,
  remainingMinutes,
  remainingShare,
  thresholdPercent,
  ttlFromTranscript,
  weather,
} from '../hooks/logic'

const BAND = {
  plugin: 'cache-wetter',
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
    expect(cacheTone(0.8)).toBe('success')
    expect(cacheTone(0.25)).toBe('warning')
    expect(cacheTone(0.1)).toBe('error')
  })

  test('the bar has twenty cells and keeps one lit until the end', async () => {
    expect(cacheBar(1)).toBe('█'.repeat(BAR_CELLS))
    expect(cacheBar(0.5)).toBe('█'.repeat(10) + '░'.repeat(10))
    expect(cacheBar(0.001)).toBe('█' + '░'.repeat(19))
    expect(cacheBar(0)).toBe('░'.repeat(BAR_CELLS))
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

      await ui.press({ key: 'toggle' })
      expect(await ui.find({ key: 'compact' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^Ctx / })).toBeDefined()

      await ui.press({ key: 'toggle' })
      expect(await ui.find({ key: 'compact' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('the pause button sits beside Compact, and stays when folded', async ($, on) => {
    mock.store(on)
    nothingBeneath(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...BAND, surface })
      expect(await ui.find({ key: 'compact' })).toBeDefined()
      expect(await ui.find({ key: 'pause' })).toBeDefined()
      await ui.press({ key: 'toggle' })
      expect(await ui.find({ key: 'compact' })).toBeUndefined()
      expect(await ui.find({ key: 'pause' })).toBeDefined()
      await ui.press({ key: 'toggle' })
      await ui.unmount()
    }
  })

  test('the band of another mod beneath (a progress bar) stays visible under ours, folded or not', async ($, on) => {
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
      await ui.press({ key: 'toggle' })
      expect(await ui.find({ type: 'Text', text: /Fortschritt 3\/7/ })).toBeDefined()
      await ui.press({ key: 'toggle' })
      await ui.unmount()
    }
  })
})
