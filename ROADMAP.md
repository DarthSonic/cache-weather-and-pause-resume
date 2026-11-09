# Roadmap

What comes next, and in which line of versions:

- **0.9.x** takes everything around the shutdown button, and bug fixes.
- **0.10.0** is the next feature release: everything beyond that.

Every item is planned in detail before it is built, so its shape can still change; there are no dates. Ideas and
votes are welcome as [issues](https://github.com/DarthSonic/cache-weather-and-pause-resume/issues/new/choose).

## 0.9.x — Shutdown and fixes

- [x] **0.9.1: the shutdown button after `/clear`.** It could stay dimmed for good, saying it was still checking; now
  a press checks again.
- [ ] **Notifications.** A system notification when the shutdown countdown starts (the last chance to cancel for
  someone working in another window), when keep-warm ends and when the pause is reached.
  *To plan:* which of them are on by default, a setting to turn them off, what the terminal and the desktop app each
  show.
- [ ] **Pause the other sessions too.** Today the shutdown pauses only the session where it was pressed; other Claude
  sessions on the computer end with it, their runs cut off. The mod in each session could see through its state file
  that a shutdown is asked for, pause its own session the same way, and the countdown would start once all of them
  are paused.
  *To plan:* which sessions count (only ones that run the mod), how long to wait for one that does not answer,
  questions about long tasks in several sessions at once, showing in the band whom it waits for, writing the shared
  state file from several sessions safely.
- [ ] **Hibernate instead of shutdown.** A setting to choose: shutdown, or hibernate (`shutdown /h` on Windows,
  `systemctl hibernate` on Linux). Why: the Windows shutdown closes other programs without asking, so unsaved work in
  them is lost; hibernation keeps them, and the Claude session.
  *To plan:* checking at session start whether hibernation is available (as for the shutdown today), sleep as a
  third choice, macOS.
- [ ] **Shutdown when done.** Claude finishes the running task instead of pausing it; then the countdown and the
  shutdown. For leaving a long run going overnight.
  *To plan:* a longest wait, what happens while Claude waits for an answer or a permission, where the choice sits
  (the band has no room for another button).
- [ ] **CI on Windows and macOS** next to Ubuntu, so the path logic is tested where it runs. It does not test a real
  shutdown.
- [ ] **A macOS test.** An issue labelled `help wanted` asking someone with a Mac to try the shutdown button; until
  then the README marks macOS as untested.
- [ ] Bug fixes from issues.

Order: notifications and CI first (small, and they make the shutdown safer), then pausing the other sessions (today
their runs die with the shutdown), then hibernation, then shutdown when done.

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
