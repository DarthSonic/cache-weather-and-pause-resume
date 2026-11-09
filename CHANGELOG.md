# Changelog

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
