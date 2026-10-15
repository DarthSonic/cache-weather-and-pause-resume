# Changelog

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
