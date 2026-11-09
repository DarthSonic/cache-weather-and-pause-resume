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
- [ ] **CI on Windows and macOS** next to Ubuntu, so the path logic is tested where it runs. It does not test a real
  shutdown.
- [ ] **A macOS test.** An issue labelled `help wanted` asking someone with a Mac to try the shutdown button; until
  then the README marks macOS as untested.
- [ ] Bug fixes from issues.

Order: the CI matrix and the macOS test; then 0.10.0.

## 0.10.0 — Next features

- [ ] **Usage limits.** The five-hour and seven-day windows of a subscription, with their reset times. A warning in
  the band from about 80 % rather than a permanent reading; keep-warm stops when the five-hour window is nearly full,
  so it does not spend the last of it.
  *To plan:* the thresholds; what a session on an API key shows instead (it has no windows).
- [ ] **Keep-warm balance.** What the refreshes cost, set against the rebuild of the cache they avoided.
  *To plan:* honest wording (the saving is real only if you come back), prices per model, where it shows (a log
  line, the band).
- [ ] **Longer keep-warm for the 60-minute cache.** A refresh reads the cache at about 0.1× the input price; a
  rebuild writes it at 1.25× (5-minute cache) or 2× (60-minute cache). With the 5-minute cache, 45 minutes are about
  11 refreshes, 1.1×, just under a rebuild: that limit stays. With the 60-minute cache, 8 hours are about 0.8×
  against 2×; it pays up to about 18 hours, so a setting could keep it warm overnight.
  *To plan:* whether the default stays at 8 hours.
- [ ] **Context forecast.** "Auto-compact in about 6 turns", from the average of the last turns.
  *To plan:* whether it is steady enough (one large file read skews it); shown only near the threshold?

## Docs and reach

- [ ] **A short GIF in the README** showing the pause, the countdown and keep-warm at work. After 0.10.0, once the
  band has its new look.

## Not planned for now

- More buttons in the band: it has just been made compact, and room is short.
- More languages than German and English.
- Compact with your own instructions: `/compact <text>` does that already.
