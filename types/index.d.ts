/**
 * The cache lifetime and where it came from: the transcript's last cache write, a model switch, a resumed session's
 * start, or an earlier session — `confirmed` when a session read it within the last day, `remembered` (shown with „?“)
 * when not.
 */
export type Ttl = {
  minutes: 5 | 60
  source: 'transcript' | 'model-switch' | 'session-start' | 'confirmed' | 'remembered'
}

/** The live context window as the status line reads it. */
export type ContextFill = { percent: number | null; tokens: number | null; window: number }

/** The auto-compact threshold in percent of the window; `isFallback` when the session gave none. */
export type Threshold = { percent: number; isFallback: boolean }

/** Where the session stands: working, asked to pause and finishing up, or paused until „weitermachen“. */
export type PausePhase = 'running' | 'pausing' | 'paused'

/**
 * Why keep-warm waits for the next request: the idle span ran out, a refresh found the cache gone, or the cache is
 * `cold` after a compaction or a switch to another model (the next request writes the new one).
 */
// 'compacted' and 'switched' (0.10.3) say why there is no cache to keep warm; 'cold' is what an older version left.
export type KeepWarmNote = 'ended' | 'missed' | 'cold' | 'compacted' | 'switched' | 'limit'

/** The systems the shutdown button knows. */
export type ShutdownOs = 'windows' | 'linux' | 'macos'

/** What the button does once the sessions are paused: shut down, sleep (standby) or hibernate (option `shutdownMode`). */
export type ShutdownMode = 'shutdown' | 'sleep' | 'hibernate'

/**
 * Whether the shutdown button can shut the computer down unattended, and with which command; or why not. `no-right`:
 * the Windows account lacks the right to shut the system down; `no-permission`: neither systemd-logind nor a
 * password-free sudo lets the session power off; `unknown-os`: a system the button does not know; `check-failed`: the
 * check itself could not run.
 */
export type ShutdownReadiness = (
  | { isReady: true; os: ShutdownOs; command: readonly string[] }
  | { isReady: false; os: ShutdownOs | 'unknown'; reason: 'no-right' | 'no-permission' | 'no-sleep' | 'no-hibernate' | 'unknown-os' | 'check-failed' }
) & {
  /** The mode it was checked for (0.9.5): one checked for another mode, or before 0.9.5 (shutdown), does not count. */
  mode?: ShutdownMode
}

/** Where the shutdown stands: none, asked for (the pause runs), counting down, or the command is running. */
export type ShutdownPhase = 'idle' | 'requested' | 'waiting' | 'countdown' | 'shutting'

/** One session's sign of life in the state file, written by that session alone. */
export type LiveSession = {
  /** When it was last written: every 15 seconds, and at each change of its pause. */
  seenAt: number
  /** The last part of its working folder, to name it to the person. */
  folder: string | null
  phase: PausePhase
  /** A turn of its main conversation runs, since when. */
  workingSince: number | null
  /** Background runs in flight when Claude last stopped there, by their description. */
  runs: string[]
  /** A permission prompt or a question waits for the person there. */
  isAwaitingPerson: boolean
  /** The request of another session it has taken up. */
  requestId: string | null
  /** For the sessions overview (0.10.0; absent from earlier versions): since when it is paused, its context and
   * threshold in percent, when its cache lapses, whether keep-warm is on, its model. */
  pausedAt?: number | null
  contextPercent?: number | null
  thresholdPercent?: number | null
  cacheUntil?: number | null
  keepWarm?: boolean
  model?: string | null
}

/** A request for all sessions, written by the session where Pause or Shutdown was pressed, and by no other. */
export type SessionRequest = {
  id: string
  kind: 'pause' | 'shutdown'
  /** The session that made it, and its folder. */
  by: string
  byFolder: string | null
  at: number
  /**
   * `open`: its Claude asks the person; `decided`: the others pause now; `countdown`: the shutdown counts down;
   * `cancelled`: the shutdown was called off, the pauses stay; `resumed`: the work is picked back up everywhere;
   * `withdrawn`: a pause the person kept to its own session; `done`: the computer is going down.
   */
  state: 'open' | 'decided' | 'countdown' | 'cancelled' | 'resumed' | 'withdrawn' | 'done'
  decidedAt: number | null
  /** Per other session with running work: end its runs now, or wait for them. */
  decisions: Record<string, RunsDecision>
  /** For a shutdown: what the computer does, as the making session's option says (0.9.5; absent before: shut down). */
  mode?: ShutdownMode
  countdownUntil: number | null
}

export type RunsDecision = 'end' | 'wait'

declare module 'claude-code' {
  interface PluginState {
    'cache-weather-and-pause-resume': {
      lastResponseAt: number | null
      ttl: Ttl | null
      hitRate: number | null
      context: ContextFill | null
      threshold: Threshold | null
      now: number
      transcriptPath: string | null
      isCompacting: boolean
      pausePhase: PausePhase
      /** When the pause was asked for. */
      pauseRequestedAt: number | null
      /** When the session went into the pause. */
      pausedAt: number | null
      /** Whether the model has the pause request in front of it (false while an appended row waits for the next request). */
      pauseDelivered: boolean
      /** Background tasks still in flight when Claude last stopped while pausing. */
      pauseTasksLeft: number | null
      /** Whether a turn of the main conversation runs now. */
      turnRunning: boolean
      /** The session's id, the key its pause is kept under in the state file. */
      sessionId: string | null
      /** The language the band and the pause texts use, once session.start has read the settings. */
      language: 'de' | 'en' | null
      /** Whether keep-warm is on: the person's choice alone, kept on disk. */
      keepWarm: boolean
      /** When a request last read or wrote the cache: the conversation's own, or a keep-warm refresh. */
      cacheUsedAt: number | null
      /** The last request that was no refresh, or keep-warm switched on: the idle span counts from here. */
      activeAt: number | null
      keepWarmNote: KeepWarmNote | null
      /**
       * When a compaction or a switch of model left the conversation without a cache (0.10.3): the band shows it
       * expired from then on, until the next response writes the new one. Null otherwise.
       */
      cacheGoneAt: number | null
      /** The usage windows the last response reported (0.10.0): empty off a subscription. */
      usageWindows: { kind: string; percentUsed: number; resetsAt?: string }[]
      /** Refreshes since the last request that was none. */
      keepWarmRefreshes: number
      /** What those refreshes cost, in input tokens' worth, until a balance is drawn (0.10.0). */
      keepWarmSpent: number
      /** A permission prompt (or an MCP server's form) waits for the person (0.10.2): what a pause asks them to answer. */
      isAwaitingApproval: boolean
      /** The model the main conversation's last request named: it sets what a cache read costs. */
      mainModel: string | null
      /** How many tokens the context grew by in each of the last turns that grew it (0.10.0, the forecast). */
      turnGrowths: number[]
      /** The context's tokens when the last turn ended. */
      lastTurnTokens: number | null
      /** The sessions the overview shows (0.10.0): the signs of life alive, this session's first. */
      sessionsView: { id: string; isSelf: boolean; entry: LiveSession }[]
      /** Whether Claude waits for the person: a permission prompt or a question is open. Keep-warm counts it as idle. */
      isAwaitingPerson: boolean
      /** Whether and how the computer can be shut down unattended; null until the session start has checked. */
      shutdownReadiness: ShutdownReadiness | null
      /** Whether a press of Shutdown waits for the check it set off: the status row says so meanwhile. */
      isCheckingShutdown: boolean
      shutdownPhase: ShutdownPhase
      /** When the countdown ends and the command runs. */
      shutdownAt: number | null
      /** Since when a turn of the main conversation runs; null between turns. Another session's question names it. */
      workingSince: number | null
      /** The background runs in flight when Claude last stopped, by description. */
      backgroundRuns: string[]
      /** Whether the band turns question dialogs away: the pause's question is asked, or another session paused it. */
      questionsClosed: boolean
      /** The request for all sessions this session made, or follows. */
      sessionRequest: SessionRequest | null
      /** Whether this session made the request (own) or another one did (foreign). */
      requestRole: 'own' | 'foreign' | null
      /** The other sessions this session's request listed for the person's answer, by id. */
      listedSessions: string[]
      /** The request of another session that paused this one. */
      pausedByRequest: string | null
      /** Whether that pause found the session idle and took it without a prompt. */
      isIdlePause: boolean
      /** The folders of the sessions the shutdown still waits for. */
      waitingSessions: string[]
      /** Sessions at work without the mod, which the shutdown cannot pause. */
      sessionsWithoutMod: number
    }
  }
}
