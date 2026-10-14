/** The cache lifetime and where it was read: the transcript's last cache write, a model switch, or an earlier session. */
export type Ttl = { minutes: 5 | 60; source: 'transcript' | 'model-switch' | 'remembered' }

/** The live context window as the status line reads it. */
export type ContextFill = { percent: number | null; tokens: number | null; window: number }

/** The auto-compact threshold in percent of the window; `isFallback` when the session gave none. */
export type Threshold = { percent: number; isFallback: boolean }

/** Where the session stands: working, asked to pause and finishing up, or paused until „weitermachen“. */
export type PausePhase = 'running' | 'pausing' | 'paused'

declare module 'claude-code' {
  interface PluginState {
    'cache-wetter': {
      lastResponseAt: number | null
      ttl: Ttl | null
      hitRate: number | null
      context: ContextFill | null
      threshold: Threshold | null
      now: number
      isCollapsed: boolean
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
    }
  }
}
