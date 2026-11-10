# Changelog

## 0.10.3 — 2026-11-10

- **After `/compact` or a switch of model the cache shows expired at once.** The conversation, or the new model, has
  no cache yet; the band no longer counts down the old one's time. The next response starts the countdown afresh.
- **Keep-warm says why it waits**: „Keep-warm: wartet auf die nächste Anfrage, denn nach dem Compact gibt es noch
  keinen Cache“ / “… as there is no cache yet after the compaction” (or after the model switch).
- A rebuild after a compaction or a switch is no lapse: with keep-warm off it no longer says what keep-warm would have
  saved.

## 0.10.2 — 2026-11-10

- **Approvals during a pause.** From the press of Pause or Shutdown until the pause is over, no new approval comes up:
  the request tells Claude that steps needing your approval wait for “continue”, and a call of the main conversation
  that asks anyway is turned away; Claude notes it and repeats it after “continue”. An approval already on screen at
  the press cannot be cancelled by a mod: the status row says so and asks you to answer it, so the pause can be set up
  („Eine Freigabe ist offen, und der Mod kann sie nicht abbrechen: Bitte beantworte sie, damit die Pause eingerichtet
  werden kann“). A shutdown names another session that waits for an answer or approval in its waiting row. Subagents'
  calls are left alone.

## 0.10.1 — 2026-11-09

- **What keep-warm saves, as it stands.** Each refresh's line ends with what going on now would save against
  building the cache again („…; Weitermachen spart jetzt ≈ 92 % (≈ 835.500 Input-Tokens)“ / “…; continuing now saves
  ≈ 92 % (≈ 835,500 input tokens' worth)”).
- **The balance leads with the saving**: „↻ Keep-warm hat ≈ 92 % gespart (≈ 835.500 Input-Tokens): 2 Auffrischungen
  statt Neuaufbau des Caches.“ / “↻ Keep-warm saved ≈ 92 % (…): 2 refreshes instead of rebuilding the cache.”
- **What keep-warm would have saved**: with keep-warm off, the request that writes a lapsed cache again says what
  keep-warm would have saved, where it would have bridged the gap within its idle span.
- **Fixed:** when keep-warm ended after its idle span, a line at once called its refreshes unused, though the cache
  they kept stayed warm for its lifetime and going on still read it. They count as unused only once that cache lapses.

## 0.10.0 — 2026-11-09

- **Usage limits.** With a subscription, the status row shows the 5-hour and the 7-day window (and a gateway's spend
  limit) once one stands at 80 % or more, fullest first, with the time it resets („5-h-Limit 84 % · neu um 15:00“,
  the weekday where it is not today); red from 95 %. The figures come from Claude Code itself (its status line's,
  then each change of a whole point); a session on an API key has none and shows none.
- **Keep-warm stops at 90 %** of any window: a refresh would spend the last of it. It says so once in the status row
  („Keep-warm: hält an, Kontingent bei 92 %“) and in a line, and refreshes again by itself once the window starts over.
- **Sessions overview**: a new button (⧉ in the desktop app, „Sitzungen“ / “Sessions” in a terminal) opens a pane with
  every session on the computer that runs the mod, this one first: its state (working, paused, idle, waiting for an
  approval, for how long), its context against its threshold, the cache time left, keep-warm, the model and the runs
  in the background, with the usage windows above. The signs of life carry these now; the pane only shows.
- **Icons in the desktop app**: each button is a one-colour icon in text form (⇲ ⧉ ⏸ ▶ ⏻ ⏾ ❄ ✕) with its word, in a
  row of their own over the readings: beside the readings there was no room for them. The cache bar keeps 10 px from
  the row above it (6 before). A terminal keeps the words in one row. In both, Compact comes before the new Sessions
  button.
- **Readings spelled out in the desktop app**, now that they have a row of their own: „Cache noch 58 min · Treffer
  100 %“ / “Cache 58 min left · Hits 100 %”, „☑ Cache warm halten (2× aufgefrischt)“ / “☑ Keep cache warm (refreshed
  2×)”, „Kontext 24 % · Auto-Compact bei 97 %“ / “Context 24 % · auto-compact at 97 %” (an assumed threshold „ca.“ /
  “about”). A terminal keeps the short forms; status rows and logs keep the name Keep-warm.
- **What a model switch costs**: where a switch forfeits a cache that was still warm, a line with the tokens the next
  request writes again and Claude Code's own estimate in dollars (list price, a configured price, or estimated).
- The CI runs validation and the tests on Ubuntu, Windows and macOS.
- **Context forecast** in the status row: about how many turns are left until auto-compact, from ten on („Auto-Compact
  in ≈ 6 Zügen“, yellow from three, „wohl beim nächsten Zug“ at one). It reckons with the median growth of the last
  five turns that grew the context, once there are three (a turn after which it shrank, a compaction, adds nothing),
  and shows only where the session reports its own threshold. `/clear` starts it over.
- **Keep-warm's balance**, as a line in the log: when the person is back and the first request reads the cache
  keep-warm kept, what the refreshes cost set against the rebuild they spared, in input tokens' worth and as a share
  („↻ Keep-warm-Bilanz: 3 Auffrischungen kosteten so viel wie 22.620 Input-Tokens; der ersparte Neuaufbau des Caches
  hätte 300.000 gekostet. Gespart: ≈ 90 %.“); where keep-warm ends or finds the cache gone, what the refreshes cost
  for nothing. Cache reads are priced at the session model's rate (a tenth of the input price, Claude Opus 5.5 a
  twentieth, Claude Fable 5.1 and Mythos 5.1 a fortieth, an unknown model a tenth), writes at 1.25 or 2 times, the
  reply at five times. The model comes from the requests, or from the session before its first one.
- **Keep-warm for longer**, with the new option `keepWarmHours`: how long it goes on with the 1-hour cache in a session
  nobody works in, 1 to 18 hours, 8 by default. Up to 18 a refresh costs less than building the cache again; about 16
  keeps it warm overnight, and the 90 % stop keeps it from spending a subscription's last. The 5-minute cache keeps
  45 minutes, just under where it stops paying.

## 0.9.5 — 2026-11-09

- **Standby or hibernation instead of shutdown**, with the new option `shutdownMode` (`shutdown`, `sleep`,
  `hibernate`; default `shutdown`). Nothing is closed: the other programs and the Claude sessions are there again when
  the computer wakes, still paused until „Weiter“, and a shutdown request of several sessions ends with the pauses kept.
  The button, the status row, the countdown and the notification are named after the mode („Standby in 4:47“,
  „Ruhezustand“), and so are the words Claude and the other sessions read. Each mode is checked at session start:
  standby on Windows when `powercfg /a` lists S3 or S0 as available (read off the shape of its answer, not its words),
  run through Windows PowerShell's `SetSuspendState('Suspend')`; hibernation on Windows when the registry value
  `HibernateEnabled` reads 1, run with `shutdown /h`; on Linux through `loginctl can-suspend` / `can-hibernate` and
  `systemctl suspend` / `hibernate`; on macOS standby through `pmset sleepnow` (not yet tested on a Mac). Where a mode
  is not available the button is dimmed and a press says what is missing, for hibernation on Windows how to turn it
  on (`powercfg /hibernate on`, as administrator). Standby and hibernation have not yet run on real hardware; the
  checks and the dimmed button have, on Windows.
- A check's answer holds the mode it was checked for. Changing `shutdownMode` reloads the mod while the session's
  state stays: an answer checked for shutting down must not stand for hibernation, or the button would pause and
  then run `shutdown /s /f`. An answer for another mode counts for nothing: the button is dimmed, the next start or
  press checks again, and right before the command runs the mod looks once more and runs nothing if the mode changed.

## 0.9.4 — 2026-11-09

- **Pause and shutdown across sessions.** Each session that runs the mod writes a sign of life into the state file
  every 15 seconds (its folder, its pause, how long Claude has been working, its background runs by description).
  Pressing Pause or Shutdown while other sessions are at work lists them in the request, and Claude asks once: for a
  pause, this session only or all of them; for each session at work, whether its runs end now or finish first (a
  shutdown always takes the others). Claude passes the answer on with a new tool, `pause_sessions`; the request goes
  into `request.json`, which only the session that made it writes. The other sessions take it up within 15 seconds: an
  idle one counts as paused at once, without a prompt; one at work gets the pause with no question to ask, its runs
  ended or let finish as answered, and its status row names where the pause came from. From the answer on, and in a
  session paused from elsewhere, question dialogs are turned away until „weitermachen“. The shutdown waits for the
  sessions at work (for runs it was told to wait for without limit, for a session that never took the request up 15
  minutes at most, not for one whose sign of life stopped); Cancel keeps the pauses, and Resume where the request was
  made picks the others up too. A session opened after a request was decided is no part of it; one that ran the mod
  before a restart of the app finds its own request again. Sessions at work without the mod are counted in the status
  row.
- The shutdown counts down **5 minutes** instead of 60 seconds, shown as „Shutdown in 4:47“.
- **A notification as the shutdown countdown starts**, the last chance to cancel for someone in another window: through
  Claude Code's own channel, the one `preferredNotifChannel` names, with „Shutdown in 5 min“ and the session's folder.
  Terminals that show notifications (iTerm2, kitty, Ghostty) show it, elsewhere it is at most the bell; the desktop app
  draws no terminal and reports the pause itself, which is when the countdown starts. No program of the mod's own runs
  for it. The new option `notifications` (`on` / `off`, default `on`) turns it off.

## 0.9.3 — 2026-11-09

- **A status row** under the cache bar, one row per message and only while there is one, the most pressing first:
  the shutdown's countdown („Shutdown in 47 s“) or „Fährt herunter …“, the pause being prepared („⏳ Pause wird
  vorbereitet … · 1 Task läuft noch“), how long the session has been paused („Pausiert seit 12 min“, never „0 min“),
  why keep-warm waits („Keep-warm: wartet auf die nächste Anfrage“), and the shutdown check a press waits for. These
  stood among the readings and buttons before; the time paused was not shown since 0.9.0. In the desktop app the
  cache bar then keeps as much room below it as above, so it sits between the two rows.
- While the pause is prepared, **Weiter** / **Resume** stands in the button row and calls it off, as typing
  „weitermachen“ does; while the shutdown is prepared or counted down, **Abbrechen** / **Cancel** stands there.
- „Pause angefordert“ / “Pause requested” reads „Pause wird vorbereitet …“ / “Preparing the pause …”, and the same
  for the shutdown.
- The toasts that only repeated what the status row now shows are gone: the pause asked for, the session paused, the
  shutdown check under way.
- The band's minute tick starts with whichever session start comes first, as keep-warm's does.

## 0.9.2 — 2026-11-09

- **Fix:** sessions no longer overwrite each other's entries in the state file. Each session writes the file by
  reading it, changing it and writing it whole; two that did so at the same moment lost one change (a pause, a
  keep-warm switch), and one that read the file while another wrote it took it for empty and wrote over everything.
  Now each write is looked at again a quarter of a second later and made again where its change is gone (at most three
  times), and a file that does not parse is read again rather than written over; only one that stays broken for about
  half a second is written anew. The file keeps its form, so a session still running 0.9.1 goes on reading it.
- The state file loses the keys of earlier versions no code reads any more (`isCollapsed`, `keepAliveSessions`).

## 0.9.1 — 2026-11-09

- **Fix:** after `/clear` (or a resume within the running app) the shutdown button could stay dimmed for good, every
  press saying „Die Voraussetzungen werden noch geprüft“ / “still checking what it needs”, and nothing happened. The
  check's answer belongs to the session, but whether it had run was kept by the mod's module, which outlives the
  session: the new session never got an answer. Now a session start checks wherever the band holds no answer, and a
  press that finds none, or a failed check, checks right then and goes on.

## 0.9.0 — 2026-11-08

- **Shutdown**, a button beside Pause: it pauses the session as Pause does, telling Claude to ask about long tasks
  right away, and once paused counts down 60 seconds (with Cancel) and shuts the computer down: on Windows
  `shutdown /s /f /t 10` (other programs are closed without asking), on Linux `systemctl poweroff` or a password-free
  `sudo shutdown`, on macOS a password-free `sudo shutdown`. Each session start checks whether that can happen
  unattended (`whoami /priv`; `uname -s`, `loginctl can-power-off`, `sudo -n -l shutdown`); where not, the button is
  dimmed and a press says what is missing. Picking the work back up cancels it. The mod starts programs again, for
  this alone, each by its full path in the system's folders with that folder as the working folder, so a program
  planted in the session's folder is never run. macOS is not yet tested on a real Mac.
- Keep-warm is on by default: a new session starts with it checked, the option `keepWarm` (`on` / `off`) sets that.
  A session where the person unchecks it keeps it off (`keepWarmOffSessions` in the state file).
- A pause asked for in any words or language is recognised: the mod gives Claude a tool, `pause_state`, listed from the
  start, whose description holds the pause steps. Claude calls it with `paused` once it has finished pausing, and with
  `running` when the person picks the work back up in whatever words; the band shows „Weiter“ / “Resume” or „Pause“
  and keeps the pause in the state file as the button does, so it survives a restart of the app. The button's request
  and the notes during a pause name the tool too. Before, only the button and a few whole-message words paused.
- A more compact band: the hit rate rides on the cache time („Cache 60 m / 98 %“, no „Hits“), the threshold on the
  context („Ctx 74 % / 97 %“, no „Max“); the readings with keep-warm between them, and Compact with Pause and
  Shutdown, stand half a gap apart. The Pause and Resume buttons carry no sign any more, the German one reads „Weiter“
  (it still sends „weitermachen“), and the time paused is no longer shown.
- CI against Claude Code 2.1.319.
- In the desktop app the cache time and the context keep their width in a narrow band instead of breaking over two
  lines or being cut („Cache 6…“).
- For the plugin directory: `plugin.json` no longer names `types`, which Claude Code does not read when loading;
  `claude plugin validate` finds the state contract at `./types/index.d.ts` without it and still holds every state
  key to it.

## 0.8.1 — 2026-10-15

- For the plugin directory: a permission prompt that waits for the person is read off Claude Code's notice
  (`classic.Notification`, `permission_prompt`, about six seconds after the prompt appeared) instead of a hook on
  `classic.PermissionRequest`, which the directory could not confirm leaves the answer to the person. MCP servers'
  forms (`elicitation_dialog`, `elicitation_url_dialog`) count as waiting too. Keep-warm treats both as idle, as before.

## 0.8.0 — 2026-10-15

- **Keep-warm**, a checkbox beside the cache time (`[ ]` / `[✓]` in a terminal, ☐ / ☑ in the desktop app): shortly
  before the prompt cache runs out (a minute before the end of a 5-minute cache, five minutes before the end of a
  1-hour one) the mod asks one question over the conversation as its last request sent it (`$.model.fork`), which the
  API reads from the cache and so keeps warm. The question asks for “OK”, may call no tool and stays out of the
  conversation; each refresh logs the tokens read and replied.
  - While Claude works, it refreshes for as long as that takes; an idle or paused session is kept warm for 8 hours
    (1-hour cache) or 45 minutes (5-minute cache) from the last request or input, then the band and a log line say
    why it stopped. Claude waiting for the person (a permission prompt, a question) counts as idle; the answer
    starts the span over. A refresh that finds the cache gone waits for the next request instead of building it
    afresh, and so does keep-warm after a compaction or a switch to another model. Only answered requests count.
    (Some of these rules follow cachebeat by ARahim3.)
  - Only the person checks or unchecks it, per session: a restart or resume keeps it, a new session and `/clear`
    start without. The state file keeps `keepWarmSessions` by session id, pruned with deleted sessions.
- The cache bar has a line of its own below the band, over its full width: a heavy line in the cache's colour over a
  light one in a terminal, a picture a few pixels high in the desktop app. Yellow from 60 % of the lifetime left,
  red from 20 % (the cache time too).
- An expired cache hides Hits, Ctx and Max until the next response.
- The band no longer folds: the ▾ / ▸ button and the folded view are gone (`isCollapsed` in the state file is
  ignored).

## 0.7.1 — 2026-10-14

- The cache lifetime is back where a session cannot read its transcript (over 3.5 MiB, which since Claude Code
  2.1.300 comes early, as a transcript also records each request's system prompt and tools):
  - The lifetime last seen also applies when Claude Code starts the session over (`/compact`, `/clear`, a resume);
    before, it only did at the mod's own start, and such a session showed `Cache ?`.
  - A lifetime a session read within the last day counts as confirmed and shows without `?`; it follows the account's
    setting, not the session. The state file keeps `ttlConfirmedAt` for it.
  - A resumed session's start tells the lifetime when its last response is 5 to 60 minutes old: Claude Code reports
    whether the cache likely expired.
- Since Claude Code 2.1.299 `turn.start` also comes for subagents' turns: only the main loop's turn counts as Claude
  working, so a press on Pause while only a subagent works goes to Claude as a prompt again.
- CI against Claude Code 2.1.299.

## 0.7.0 — 2026-10-14

- In a terminal the band uses narrow signs instead of emoji: ☼ / ≋ / ↯ for the weather, in yellow, light blue and red,
  `❚❚ Pause`, `► Resume` and `❚❚ Pause requested`. Terminals count an emoji's width in their own way: the terminal
  in the Claude desktop app counted ☀️ and ⏳ as one column where Claude Code counts two, and the band kept leftovers
  of an earlier frame (`HitsC–`, `Max 897%*`); Windows Terminal drew ⏸ over the space after it.
  The desktop app keeps the emoji.
- No stray space after the cache time when no cache bar follows.

## 0.6.2 — 2026-10-14

- No change in behaviour. For the plugin directory: the listing fields `icon`, `documentationUrl` and `supportUrl` in
  `plugin.json`; the READMEs open with three examples and name GitHub issues for support; a test helper called `key`
  is called `fromHome` (the review read the name as a credential).

## 0.6.1 — 2026-10-14

- No change in behaviour: the helper that groups the digits of token counts is called `groupDigits` (it was
  `formatTokens`, which the plugin directory's review read as handling a credential).

## 0.6.0 — 2026-10-14

- Renamed from `cache-wetter` to `cache-weather-and-pause-resume`: says what it does, in English. The repository moved
  to `DarthSonic/cache-weather-and-pause-resume` (GitHub forwards the old address).
- Installed from the marketplace `darthsonic` (`DarthSonic/claude-plugins`), the catalog of plugins that each live in a
  repository of their own; the repository carries no marketplace of its own any more.
- The state file moved to `~/.claude/cache-weather-and-pause-resume/state.json`; what `cache-wetter` kept is not
  carried over.

## 0.5.0 — 2026-10-14

For the plugin directory's review:

- Starts no program any more: a transcript over 3.5 MiB is not read (its tail was read by `tail` or PowerShell); the
  lifetime last seen stands, and a resumed session takes the time of its last response from the session start.
- Reads no Claude Code settings any more (they can hold keys and helper commands): `language: auto` follows the locale
  variables, then the system locale.
- The paths of the files it touches are spelled out in each call, under the home folder.
- The READMEs say what the mod does on your machine: the prompts and rows it hands Claude, `/compact`, the files it
  reads and writes, the variables it reads, and what each hook changes.
- An icon.

## 0.4.0 — 2026-10-14

- German and English: the band, the toasts and the texts Claude gets follow the new `language` option (`auto`, `de`,
  `en`); `auto` reads Claude Code's `language` setting, the locale variables, then the system locale. Typed
  “pause” / “pausieren” and “continue” / “weitermachen” are understood in either language.
- First public release.

## 0.3.4 — 2026-10-14

- A row gap sets the band apart from another mod's band stacked below it; the gap only exists between the two.

## 0.3.3 — 2026-10-14

- Shorter labels so the band fits one line: `m` for minutes, `Hits`, `Ctx`, `Max`, `⏸ Pause`.

## 0.3.2 — 2026-10-14

- Stacks what other mods draw in the band below its own row instead of hiding it.

## 0.3.1 — 2026-10-14

- Pauses of deleted sessions are dropped from the state file ten seconds after a session starts.

## 0.3.0 — 2026-10-14

- What outlives a session (pauses by session id, the folded band, the cache lifetime) lives in
  `~/.claude/cache-wetter/state.json`, so a paused session still shows “Resume” after an app restart.
- While a pause is requested the band shows only its state; typing “continue” takes the request back.

## 0.2.0 — 2026-10-12

- Pause / Resume button: Claude lets running work finish, asks about long tasks, saves the state and waits.

## 0.1.0 — 2026-10-12

- The band: prompt-cache countdown, cache hit rate, context weather, fill and auto-compact threshold, Compact button,
  the summary as log lines after `/compact`.
