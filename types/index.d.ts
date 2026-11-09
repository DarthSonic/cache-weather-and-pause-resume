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
export type KeepWarmNote = 'ended' | 'missed' | 'cold'

/** The systems the shutdown button knows. */
export type ShutdownOs = 'windows' | 'linux' | 'macos'

/**
 * Whether the shutdown button can shut the computer down unattended, and with which command; or why not. `no-right`:
 * the Windows account lacks the right to shut the system down; `no-permission`: neither systemd-logind nor a
 * password-free sudo lets the session power off; `unknown-os`: a system the button does not know; `check-failed`: the
 * check itself could not run.
 */
export type ShutdownReadiness =
  | { isReady: true; os: ShutdownOs; command: readonly string[] }
  | { isReady: false; os: ShutdownOs | 'unknown'; reason: 'no-right' | 'no-permission' | 'unknown-os' | 'check-failed' }

/** Where the shutdown stands: none, asked for (the pause runs), counting down, or the command is running. */
export type ShutdownPhase = 'idle' | 'requested' | 'countdown' | 'shutting'

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
      /** Refreshes since the last request that was none. */
      keepWarmRefreshes: number
      /** Whether Claude waits for the person: a permission prompt or a question is open. Keep-warm counts it as idle. */
      isAwaitingPerson: boolean
      /** Whether and how the computer can be shut down unattended; null until the session start has checked. */
      shutdownReadiness: ShutdownReadiness | null
      /** Whether a press of Shutdown waits for the check it set off: the status row says so meanwhile. */
      isCheckingShutdown: boolean
      shutdownPhase: ShutdownPhase
      /** When the countdown ends and the command runs. */
      shutdownAt: number | null
    }
  }
}
