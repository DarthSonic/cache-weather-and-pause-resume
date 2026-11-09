# Roadmap

What comes next, and in which line of versions:

- **0.9.x** takes everything around the shutdown button, and bug fixes.
- **0.10.0** is the next feature release: everything beyond that.

Every item is planned in detail before it is built, so its shape can still change; there are no dates. Ideas and
votes are welcome as [issues](https://github.com/DarthSonic/cache-weather-and-pause-resume/issues/new/choose).

## 0.9.x — Shutdown and fixes

- [x] **0.9.1: the shutdown button after `/clear`.** It could stay dimmed for good, saying it was still checking; now
  a press checks again.
- [ ] **Session files, and a state file sessions cannot overwrite (fix).** Each session writes a file of its own,
  `sessions/<session id>.json`: a sign of life, its phase, and what the mod knows of its work (a turn running since …,
  background runs, an open dialog). The entries per session in `state.json` (pauses, the keep-warm switch) move
  there, so two sessions writing at once no longer lose one. Keys no code reads any more (`isCollapsed`,
  `keepAliveSessions`) go.
- [ ] **A status row.** A third row under the bar, shown only when there is something to say, for states that last:
  the pause being prepared, waiting for a task, "paused for 12 min" (a duration, "< 1 min" rather than "0 min"), the
  shutdown countdown, whom the shutdown waits for, keep-warm's notes, the shutdown check. The buttons stay in the
  main row; toasts remain for one-off events only.
- [ ] **Notifications.** A system notification when the shutdown countdown starts (the last chance to cancel for
  someone working in another window), when keep-warm ends and when the pause is reached.
  *To plan:* which of them are on by default, a setting to turn them off, what the terminal and the desktop app each
  show.
- [ ] **Pause and shutdown across sessions.** Today the shutdown pauses only the session where it was pressed; other
  Claude sessions on the computer end with it, their runs cut off. One Shutdown button, which shuts down once every
  session is done, whether it already is or the runs are waited for:
  - The session where Pause or Shutdown was pressed writes `request.json` (which of the two, its id, the time, the
    decisions); no other session writes it.
  - Its Claude asks once: about its own long tasks, end or wait (as today); for a pause, whether the other sessions
    pause too (a shutdown always takes them); for each other session with runs, end or wait. A tool takes the answer
    into `request.json`. A pause stays with its own session unless the answer says otherwise.
  - From the request on, the other sessions ask nothing: the mod turns a question dialog away with "keep it for the
    resume". They report their runs, end them or let them finish as decided, then pause. After its answer the
    triggering session asks nothing more either.
  - A session with no run, no prompt being worked on and no open dialog counts as paused at once, and shows Resume.
  - Runs the person chose to wait for are waited for without limit. A session that does not answer (no sign of life,
    no report) is waited for 15 minutes at most.
  - Then a countdown of 300 seconds (60 today), and the shutdown. Cancel in the triggering session cancels it for all;
    the pauses stay.
  - Only sessions that run the mod can be paused. A transcript written in the last minutes that belongs to none of
    them is named in the status row: "runs without the mod, not paused".
  - The README's section on what the mod does on your machine names the new files and the prompts another session
    sets off.
  *To check while building:* whether the mod can cut short a long step that another session's Claude is in the middle
  of; if not, "end" means at the end of that step.
- [ ] **Hibernate instead of shutdown.** A setting to choose: shutdown, or hibernate (`shutdown /h` on Windows,
  `systemctl hibernate` on Linux). Why: the Windows shutdown closes other programs without asking, so unsaved work in
  them is lost; hibernation keeps them, and the Claude session.
  *To plan:* checking at session start whether hibernation is available (as for the shutdown today), sleep as a
  third choice, macOS.
- [ ] **CI on Windows and macOS** next to Ubuntu, so the path logic is tested where it runs. It does not test a real
  shutdown.
- [ ] **A macOS test.** An issue labelled `help wanted` asking someone with a Mac to try the shutdown button; until
  then the README marks macOS as untested.
- [ ] Bug fixes from issues.

Order: the session files with the state-file fix first (the ground for the rest), then the status row,
notifications, pause and shutdown across sessions, and hibernation; the CI matrix alongside.

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
