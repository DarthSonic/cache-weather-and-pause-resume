// Pure helpers of the cache-weather-and-pause-resume band: no `$`, so the tests can call them directly.

import type { Lang } from './i18n'

/** The auto-compact threshold when the session does not say: 83 % of the window. */
export const FALLBACK_THRESHOLD_PERCENT = 83

/** A log line the terminal draws whole is up to 2000 characters; stay below it. */
export const LOG_CHUNK = 1800

export type Weather = '☀️' | '🌧️' | '⛈️'

export type CacheTone = 'success' | 'warning' | 'error'

/** What is left of the cache, as a share of its lifetime (0..1), or null before the first response. */
export function remainingShare(lastResponseAt: number | null, ttlMinutes: number | null, now: number): number | null {
  if (lastResponseAt === null || ttlMinutes === null) return null
  const ttlMs = ttlMinutes * 60_000
  return Math.max(0, Math.min(1, (lastResponseAt + ttlMs - now) / ttlMs))
}

/** Whole minutes left, rounded up, so the label reads 0 only when the cache is gone. */
export function remainingMinutes(lastResponseAt: number, ttlMinutes: number, now: number): number {
  return Math.max(0, Math.ceil((lastResponseAt + ttlMinutes * 60_000 - now) / 60_000))
}

/** Green, yellow from 60 % of the lifetime left, red from 20 %. */
export function cacheTone(share: number): CacheTone {
  if (share <= 0.2) return 'error'
  if (share <= 0.6) return 'warning'
  return 'success'
}

/**
 * The cache bar's line in a terminal, `columns` cells wide: line signs in the middle of their cells, a heavy line for
 * what is left of the lifetime, a light one for what has run out. (Block signs at a cell's foot sat too far from the
 * row above, 2026-10-15.) A cell stays lit while any of its slice is left.
 */
export function terminalBar(share: number | null, columns: number): { lit: string; spent: string } {
  const width = Math.max(0, Math.floor(columns))
  const lit = share === null || share <= 0 ? 0 : Math.min(width, Math.ceil(share * width))
  return { lit: '━'.repeat(lit), spent: '─'.repeat(width - lit) }
}

// The picture's bar: a few pixels high, below a gap that sets it off from the row above.
const BAR_GAP = 6
const BAR_THICKNESS = 4

/** How high the desktop app, VS Code and the phone draw the cache bar's picture, its gap above included (CSS px). */
export const SVG_BAR_HEIGHT = BAR_GAP + BAR_THICKNESS

// Fixed colours: an SVG drawn as an image reads no theme. Each reads on a light and a dark background alike.
const BAR_COLOURS: Record<CacheTone, string> = { success: '#30a46c', warning: '#f5a524', error: '#e5484d' }

/**
 * The cache bar as an SVG, stretched over the band's width: wider than any band, so the slot it is drawn in caps it,
 * and without a fixed aspect ratio, so it keeps its few pixels of height. A grey track, lit for what is left, below a
 * transparent gap.
 */
export function svgBar(share: number | null): string {
  const width = 4000
  const lit = share === null ? 0 : Math.round(Math.max(0, Math.min(1, share)) * width)
  const bar = `y="${BAR_GAP}" height="${BAR_THICKNESS}"`
  const fill = share === null ? '' : `<rect ${bar} width="${lit}" fill="${BAR_COLOURS[cacheTone(share)]}"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${SVG_BAR_HEIGHT}" ` +
    `viewBox="0 0 ${width} ${SVG_BAR_HEIGHT}" preserveAspectRatio="none">` +
    `<rect ${bar} width="${width}" fill="#808080" fill-opacity="0.25"/>${lit > 0 ? fill : ''}</svg>`
  )
}

/** How long before the cache lapses keep-warm refreshes it: a minute for the five-minute cache, five for the hour's. */
export function keepWarmLeadMs(ttlMinutes: 5 | 60): number {
  return ttlMinutes === 5 ? 60_000 : 5 * 60_000
}

/**
 * How long keep-warm goes on in a session nobody works in (paused, or quiet after its last turn), from the last
 * request or input: 8 hours for the hour's cache, 45 minutes for the five-minute one, whose refreshes come twelve times
 * as often.
 */
export function keepWarmSpanMs(ttlMinutes: 5 | 60): number {
  return ttlMinutes === 5 ? 45 * 60_000 : 8 * 60 * 60_000
}

/** The idle span as the band and the log name it: „8 h“, „45 m“. */
export function keepWarmSpanText(ttlMinutes: 5 | 60): string {
  const minutes = keepWarmSpanMs(ttlMinutes) / 60_000
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} m`
}

/**
 * What keep-warm does now: `wait` for the refresh's time, `refresh`, or neither because the cache has `lapsed` (a
 * refresh would build it afresh) or the idle span has `ended`. While Claude works there is no span.
 *
 * `cacheUsedAt` is when a request last read or wrote the cache (the conversation's own, or a refresh); `activeAt` the
 * last request or input that was no refresh, where the idle span starts.
 */
export function keepWarmStep(s: {
  cacheUsedAt: number | null
  activeAt: number | null
  ttlMinutes: 5 | 60 | null
  isWorking: boolean
  now: number
}): 'wait' | 'refresh' | 'lapsed' | 'ended' {
  if (s.cacheUsedAt === null || s.ttlMinutes === null) return 'wait'
  const lapsesAt = s.cacheUsedAt + s.ttlMinutes * 60_000
  if (s.now >= lapsesAt) return 'lapsed'
  if (s.now < lapsesAt - keepWarmLeadMs(s.ttlMinutes)) return 'wait'
  if (!s.isWorking && s.now >= (s.activeAt ?? s.cacheUsedAt) + keepWarmSpanMs(s.ttlMinutes)) return 'ended'
  return 'refresh'
}

/**
 * Whether a refresh was served from the conversation's cache: nearly all of its input read from it. The system prompt
 * alone may be served from a cache other sessions share, so some read tokens do not yet say the conversation's was warm.
 */
export function isWarmRead(usage: {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}): boolean {
  const rate = hitRate(usage)
  return rate !== null && rate >= 0.8
}

/** The share of the input tokens the cache served, or null when the response read no input. */
export function hitRate(usage: {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}): number | null {
  const total = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return total > 0 ? usage.cache_read_input_tokens / total : null
}

/**
 * The weather as a terminal draws it: narrow signs without emoji presentation, in the weather's colour. Terminals count
 * an emoji's width their own way (the desktop app's terminal one column where Claude Code counts two), and the band then
 * keeps the rest of an earlier frame; these signs take one column everywhere (2026-10-14).
 */
export function terminalWeather(sky: Weather): { sign: string; tone: 'warning' | 'suggestion' | 'error' } {
  // Theme colours, so light and dark themes both read: a yellow sun, light-blue rain, a red storm.
  if (sky === '☀️') return { sign: '☼', tone: 'warning' }
  if (sky === '🌧️') return { sign: '≋', tone: 'suggestion' }
  return { sign: '↯', tone: 'error' }
}

/** The signs of the pause button: emoji where the desktop app draws the band, narrow signs in a terminal. */
export function pauseSigns(isTerminal: boolean): { pause: string; resume: string; requested: string } {
  return isTerminal ? { pause: '❚❚', resume: '►', requested: '❚❚' } : { pause: '⏸', resume: '▶', requested: '⏳' }
}

/**
 * The lifetime a resumed session's start tells, or null: Claude Code reports the cache as likely expired exactly when
 * the last response is older than the lifetime, so a last response between 5 and 60 minutes old decides it.
 */
export function lifetimeFromResume(seconds: unknown, isLikelyExpired: unknown): 5 | 60 | null {
  if (typeof seconds !== 'number' || typeof isLikelyExpired !== 'boolean') return null
  if (seconds <= 5 * 60 || seconds >= 60 * 60) return null
  return isLikelyExpired ? 5 : 60
}

/** Sunny up to half the threshold, rain up to 80 % of it, a storm above. */
export function weather(contextPercent: number | null, thresholdPercent: number): Weather {
  const ratio = (contextPercent ?? 0) / thresholdPercent
  if (ratio <= 0.5) return '☀️'
  if (ratio <= 0.8) return '🌧️'
  return '⛈️'
}

/** The threshold in percent of the window, or null when the session gives none. */
export function thresholdPercent(autoCompactThreshold: number | undefined, window: number): number | null {
  if (!autoCompactThreshold || !window) return null
  return Math.round((autoCompactThreshold / window) * 100)
}

/**
 * The cache lifetime the session's last cache write used, read off transcript lines (JSONL): the API reports each
 * write split by lifetime (`ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`). The latest write that wrote
 * anything decides; null when the text holds none.
 */
export function ttlFromTranscript(text: string): 5 | 60 | null {
  const blocks = text.match(/"cache_creation":\{[^}]*\}/g) ?? []
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i] ?? ''
    const fiveMinutes = Number(/"ephemeral_5m_input_tokens":(\d+)/.exec(block)?.[1] ?? 0)
    const oneHour = Number(/"ephemeral_1h_input_tokens":(\d+)/.exec(block)?.[1] ?? 0)
    if (fiveMinutes > 0) return 5
    if (oneHour > 0) return 60
  }
  return null
}

/** The time of the last assistant response in transcript lines (epoch ms), or null. */
export function lastResponseFromTranscript(text: string): number | null {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue
    const stamp = /"timestamp":"([^"]+)"/.exec(line)?.[1]
    const at = stamp ? Date.parse(stamp) : NaN
    if (!Number.isNaN(at)) return at
  }
  return null
}

/** 412300 → "412.300" (German thousands) or "412,300" (English). */
export function groupDigits(n: number | undefined | null, lang: Lang): string {
  if (n === undefined || n === null) return '?'
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'de' ? '.' : ',')
}

/**
 * The log lines after a compaction: one line with the tokens before and after, then the summary Claude goes on with,
 * cut at paragraphs and numbered when it takes several lines. The summary is the kept message that says the session
 * continues, else the first one.
 */
export function compactionLines(
  messages: readonly { role: string; text: string }[],
  countBefore: number | undefined,
  countAfter: number | undefined,
  lang: Lang,
): string[] {
  const summary =
    messages.find(m => m.role === 'user' && /continued from a previous conversation/i.test(m.text))?.text ??
    messages[0]?.text ??
    ''
  const counts = `${groupDigits(countBefore, lang)} → ${groupDigits(countAfter, lang)}`
  const head =
    lang === 'de'
      ? `🗜️ Compact: ${counts} Tokens · Zusammenfassung, mit der Claude weitermacht:`
      : `🗜️ Compact: ${counts} tokens · the summary Claude carries on with:`
  const chunks = chunkSummary(summary)
  if (chunks.length === 0) return [head, lang === 'de' ? '(keine Zusammenfassung im Ergebnis)' : '(no summary in the result)']
  return [head, ...chunks.map((chunk, i) => (chunks.length > 1 ? `(${i + 1}/${chunks.length}) ${chunk}` : chunk))]
}

/**
 * Cuts a long summary into log lines of at most `max` characters, at paragraphs first, then at line breaks, then at
 * sentence ends, and only as a last resort mid-text; nothing is dropped.
 */
export function chunkSummary(text: string, max = LOG_CHUNK): string[] {
  const pieces = splitPieces(text.trim(), max)
  const chunks: string[] = []
  let current = ''
  for (const piece of pieces) {
    const joined = current ? `${current}\n\n${piece}` : piece
    if (joined.length <= max) {
      current = joined
      continue
    }
    if (current) chunks.push(current)
    current = piece
  }
  if (current) chunks.push(current)
  return chunks
}

// Paragraphs, each cut further until it fits.
function splitPieces(text: string, max: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split(/\n\s*\n/)) {
    const p = paragraph.trim()
    if (!p) continue
    if (p.length <= max) {
      out.push(p)
      continue
    }
    out.push(...cutToFit(p, max))
  }
  return out
}

// One overlong paragraph: at line breaks, then sentence ends, then hard.
function cutToFit(paragraph: string, max: number): string[] {
  const out: string[] = []
  let rest = paragraph
  while (rest.length > max) {
    const window = rest.slice(0, max)
    let cut = window.lastIndexOf('\n')
    if (cut < max / 2) {
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
      cut = sentence >= max / 2 ? sentence + 1 : cut
    }
    if (cut < max / 2) {
      const space = window.lastIndexOf(' ')
      cut = space >= max / 2 ? space : max
    }
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}
