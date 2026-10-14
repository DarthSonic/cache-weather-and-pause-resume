# Changelog

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
