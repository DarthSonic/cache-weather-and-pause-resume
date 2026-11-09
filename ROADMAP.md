# Roadmap

What comes next, and in which line of versions:

- **0.9.x** takes everything around the shutdown button, and bug fixes.
- **0.10.0** is the next feature release: everything beyond that.

Every item is planned in detail before it is built, so its shape can still change; there are no dates. Ideas and
votes are welcome as [issues](https://github.com/DarthSonic/cache-weather-and-pause-resume/issues/new/choose).

## 0.9.x — Shutdown and fixes

- [x] **0.9.1: the shutdown button after `/clear`.** It could stay dimmed for good, saying it was still checking; now
  a press checks again.
- [x] **0.9.2: a state file sessions cannot overwrite (fix).** Each write is looked at again a moment later and made
  again where another session's write took it back; a file caught half-written is read again, not written over. Keys
  no code reads any more (`isCollapsed`, `keepAliveSessions`) go. (The plan was a file per session; the mod API can
  write files but not delete them, so they would have piled up for good.)
- [x] **0.9.3: a status row.** Under the bar, one row per message and only while there is one: the shutdown's
  countdown, the pause being prepared, "paused for 12 min", why keep-warm waits, the shutdown check. While the pause
  is prepared, Resume calls it off; the toasts that only repeated a state are gone.
- [x] **0.9.4: a notification as the shutdown countdown starts**, through Claude Code's own channel (terminals such as
  iTerm2, kitty, Ghostty), option `notifications`. Notifications at the pause and at keep-warm's end were dropped: the
  desktop app already reports when Claude finishes a step, which is when a pause is reached and the countdown starts.
- [x] **0.9.4: pause and shutdown across sessions.** Each session's sign of life in the state file; Claude asks once
  where the Pause or Shutdown button was pressed (this session or all of them; per session at work, end its runs or
  wait for them); the others pause without a question, an idle one at once; the shutdown waits for them, then counts
  down 5 minutes. Cancel keeps the pauses, Resume picks them all up.
- [x] **0.9.5: standby or hibernation instead of shutdown**, option `shutdownMode`. Nothing is closed; the sessions
  are there again on waking, still paused. Each mode is checked at session start (on Windows hibernation is often off:
  `powercfg /hibernate on`).
- [x] **CI on Windows and macOS** next to Ubuntu (0.10.0), so the path logic is tested where it runs. It does not test a real
  shutdown.
- [ ] **A macOS test.** An issue labelled `help wanted` asking someone with a Mac to try the shutdown button; until
  then the README marks macOS as untested.
- [ ] Bug fixes from issues.

Order: the CI matrix and the macOS test; then 0.10.0.

## 0.10.0 — Next features

- [x] **Usage limits.** The 5-hour and 7-day windows in the status row from 80 % on, with the time they reset; red
  from 95 %. Keep-warm stops from 90 % and goes on once the window starts over. A session on an API key shows none.
- [x] **Keep-warm balance**, a log line: what the refreshes cost against the rebuild they spared, in input tokens' worth
  and as a share, priced at the session model's cache read rate; what they cost for nothing where the cache went unused.
- [x] **Longer keep-warm for the 60-minute cache**, option `keepWarmHours` (1 to 18, 8 by default): a refresh reads the
  cache at 0.1× the input price or less (Opus 5.5 0.05×), a rebuild writes it at 2×, so it pays up to some 18 hours.
  The 5-minute cache keeps 45 minutes.
- [x] **Context forecast** in the status row: about how many turns until auto-compact, from ten on, yellow from three;
  the median growth of the last five turns, once there are three; only where the session reports its own threshold.
- [x] **Sessions overview**: a button (⧉, “Sessions” in a terminal) opens a pane with every session that runs the
  mod: state, context, cache, keep-warm, model, runs.
- [x] **Icons in the desktop app**, each with its word beside it in small type; the terminal keeps words.
- [x] **What a model switch costs**, where it forfeits a warm cache: a line with the tokens and Claude Code's estimate.

## Docs and reach

- [ ] **A short GIF in the README** showing the pause, the countdown and keep-warm at work. After 0.10.0, once the
  band has its new look.

## Not planned for now

- More buttons in the band: it has just been made compact, and room is short.
- More languages than German and English.
- Compact with your own instructions: `/compact <text>` does that already.
