import { describe, expect, test } from 'claude-code/testing'

import type { LiveSession, SessionRequest } from '../types'
import {
  ALIVE_MS,
  UNANSWERED_MS,
  asksToPause,
  describeSession,
  folderOf,
  foreignPauseRequest,
  liveOthers,
  othersNote,
  readDecisions,
  waitingFor,
  withoutForgotten,
} from '../hooks/sessions'

const NOW = 50_000_000
const session = (over: Partial<LiveSession> = {}): LiveSession => ({
  seenAt: NOW,
  folder: 'repo',
  phase: 'running',
  workingSince: null,
  runs: [],
  isAwaitingPerson: false,
  requestId: null,
  ...over,
})
const request = (over: Partial<SessionRequest> = {}): SessionRequest => ({
  id: 'a1-1',
  kind: 'shutdown',
  by: 'a1',
  byFolder: 'repo-a',
  at: NOW - 60_000,
  state: 'decided',
  decidedAt: NOW - 60_000,
  decisions: {},
  countdownUntil: null,
  ...over,
})

describe('the sessions across one computer', () => {
  test('alive are the others written within a minute and a half; an hour on they are forgotten', async () => {
    const all = {
      a1: session(),
      b2: session({ seenAt: NOW - ALIVE_MS }),
      c3: session({ seenAt: NOW - ALIVE_MS - 1 }),
      d4: session({ seenAt: NOW - 61 * 60_000 }),
    }
    expect(liveOthers(all, 'a1', NOW).map(([id]) => id)).toEqual(['b2'])
    expect(Object.keys(withoutForgotten(all, NOW))).toEqual(['a1', 'b2', 'c3'])
  })

  test('the shutdown waits for sessions at work, not for paused, idle or gone ones', async () => {
    const r = request()
    const all = {
      paused: session({ phase: 'paused', requestId: r.id }),
      idle: session(),
      working: session({ workingSince: NOW - 5 * 60_000 }),
      running: session({ runs: ['Suite'], requestId: r.id, phase: 'pausing' }),
      gone: session({ seenAt: NOW - ALIVE_MS - 1, workingSince: NOW }),
    }
    expect(waitingFor(r, all, 'a1', NOW).map(([id]) => id)).toEqual(['working', 'running'])
    // One that never took the request up is not waited for past 15 minutes; one that did is, however long it takes.
    const later = NOW + UNANSWERED_MS
    const stillAlive = Object.fromEntries(Object.entries(all).map(([id, s]) => [id, { ...s, seenAt: later }]))
    expect(waitingFor(r, stillAlive, 'a1', later).map(([id]) => id)).toEqual(['running'])
  })

  test('another session’s request asks for a pause once decided, never its own, never one from before it started', async () => {
    const started = NOW - 10 * 60_000
    expect(asksToPause(request(), 'b2', NOW, started)).toBe(true)
    expect(asksToPause(request({ state: 'countdown' }), 'b2', NOW, started)).toBe(true)
    expect(asksToPause(request({ state: 'open' }), 'b2', NOW, started)).toBe(false)
    expect(asksToPause(request({ state: 'withdrawn' }), 'b2', NOW, started)).toBe(false)
    expect(asksToPause(request(), 'a1', NOW, started)).toBe(false)
    // A session opened after the request was decided was no part of it.
    expect(asksToPause(request(), 'b2', NOW, NOW)).toBe(false)
  })

  test('the answer maps short ids to sessions, leaves out what it does not know, and pauses no one unasked', async () => {
    const listed = ['b2b2b2b2-1111', 'c3c3c3c3-2222']
    expect(readDecisions({ sessions: [{ session: 'b2b2b2b2', action: 'end' }, { session: 'zz', action: 'end' }] }, listed)).toEqual({
      pauseOthers: false,
      decisions: { 'b2b2b2b2-1111': 'end' },
    })
    expect(readDecisions({ pauseOthers: true, sessions: [{ session: 'c3c3c3c3-2222', action: 'later' }] }, listed)).toEqual({
      pauseOthers: true,
      decisions: {},
    })
  })

  test('a folder by its last part; Claude reads each session with what runs there', async () => {
    expect(folderOf('C:\\Source\\Repos\\Traumfabrik')).toBe('Traumfabrik')
    expect(folderOf('/home/sven/repo/')).toBe('repo')
    expect(folderOf('C:\\')).toBeNull()
    const line = describeSession('b2b2b2b2-1111', session({ folder: 'repo-b', workingSince: NOW - 18 * 60_000, runs: ['Suite', 'Build'] }), NOW, 'de')
    expect(line).toBe('- b2b2b2b2 (repo-b): Claude arbeitet seit 18 min; 2 Läufe im Hintergrund: Suite, Build')
    const note = othersNote('shutdown', [['b2b2b2b2-1111', session({ folder: 'repo-b', runs: ['Suite'] })]], NOW, 'de')
    expect(note).toContain('Der Shutdown pausiert sie mit')
    expect(note).toContain('pause_sessions')
  })

  test('a session paused from elsewhere is told to ask nothing, and what to do with its runs', async () => {
    const end = foreignPauseRequest('shutdown', 'repo-a', 'end', 'de')
    expect(end).toContain('Pause aus der Sitzung in repo-a')
    expect(end).toContain('Stell ihm jetzt keine Frage')
    expect(end).toContain('Beende deine laufenden Hintergrund-Tasks jetzt')
    expect(foreignPauseRequest('pause', null, 'wait', 'en')).toContain('Let your running background tasks finish')
  })
})
