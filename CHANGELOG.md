# Changelog

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
