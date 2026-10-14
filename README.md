# cache-weather-and-pause-resume

[![CI](https://github.com/DarthSonic/cache-weather-and-pause-resume/actions/workflows/ci.yml/badge.svg)](https://github.com/DarthSonic/cache-weather-and-pause-resume/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*Deutsch: [README.de.md](README.de.md)*

A [Claude Code](https://code.claude.com) mod: one slim band directly above the prompt that tells you how warm the
prompt cache still is and how full the context is, with a **Compact** button and a **Pause / Resume** button that has
Claude finish what is running, save its state and wait.

![The band in the Claude desktop app: cache 60 minutes left, hits 100 %, a storm at 87 % of a 97 % threshold, Compact highlighted, the Pause button](docs/band.png)

## What the band shows

| Part | What it shows |
| --- | --- |
| **Cache** | Minutes left (`m`) of the prompt cache since the last response, with 20 cells that run empty; green, yellow in the last quarter, red in the last tenth, “expired” at 0. Redrawn every minute. |
| **Hits** | The share of the last response's input tokens that came from the cache. |
| **Weather** | ☀️ up to half the auto-compact threshold, 🌧️ up to 80 % of it, ⛈️ above. |
| **Ctx / Max** | Context fill in percent and the auto-compact threshold (`*`: the fallback of 83 %, when the session reports none). |
| **Compact** | Same as `/compact`; highlighted during ⛈️. In the desktop app, or while Claude is working, `/compact` is queued. |
| **⏸ Pause / ▶ Resume** | Asks Claude to pause the session, and carries on (below). Also shown when the band is folded. |
| **▾ / ▸** | Folds the band to weather, cache time, Ctx and the pause button. Remembered across sessions. |

After `/compact` (or the button) the mod writes the token count before and after and the summary Claude carries on
with as log lines, which the model does not read.

## The pause button

| State | Band | What happens |
| --- | --- | --- |
| working | `⏸ Pause` | A press hands Claude the pause request. |
| pause requested | `⏳ Pause requested · 2 tasks still running` | Claude lets running work finish, asks about long tasks and saves the state. Typing “continue” takes the request back. |
| paused | `▶ Resume` · `paused for 12 m` | Claude waits. A press sends “continue”, exactly as if you had typed it. |

You can also type: a message that is only “pause” (or “pausieren”) pauses; one that starts with “continue” or
“resume” (or “weitermachen”) carries on. Both languages are understood whatever the mod's language is.

The request Claude gets (full text in [`hooks/pause.ts`](hooks/pause.ts)):

1. Start nothing new; whatever is running finishes.
2. Estimate the remaining time of each background task (runs, agents, monitors, workflows). For one that will take
   longer than the threshold (**5 minutes** by default, option `askAboveMinutes`) or has no foreseeable end, ask you —
   as a dialog where available, with each task's remaining time — whether to stop it now and restart it after resuming
   (only if it can be restarted) or to let it finish. Shorter tasks are simply waited for.
3. Save the state following the project's rules (CLAUDE.md, memory): what is done, what ran, what was stopped and how
   to restart it, what comes next. Without a project rule: discard nothing, commit nothing unasked.
4. Report “Paused” briefly and wait. Scheduled wakeups (cron, `/loop`) do not run during the pause.

On “continue” Claude is told to carry on from the saved state and restart what was stopped for the pause. A message
written during the pause is answered without picking the paused work back up.

How the mod tracks the state:

- **Pressed while Claude works:** the request joins the running turn as a row Claude reads at its next request (after
  the tool call in progress). Should the turn end before that, the Stop hook keeps Claude from stopping and hands the
  request on; after an interrupted turn the next message carries it.
- **Pressed while Claude is idle:** the request goes in as a prompt in your words.
- **Paused** is reached once Claude stops and the Stop hook reports no background work in flight. While tasks still
  run the band counts them.
- A pause is kept per session in `~/.claude/cache-weather-and-pause-resume/state.json`, so a session reopened while paused (an app
  restart, a resumed session) shows **Resume** again. `/clear` ends the pause.

## Install

The mod is listed in the marketplace `darthsonic`, the catalog
[DarthSonic/claude-plugins](https://github.com/DarthSonic/claude-plugins); each plugin there lives in a repository of
its own. At the prompt of a Claude Code session in a terminal:

```
/plugin marketplace add DarthSonic/claude-plugins
/plugin install cache-weather-and-pause-resume@darthsonic
```

Pick a scope (user: every project). The same from a shell:

```
claude plugin marketplace add DarthSonic/claude-plugins
claude plugin install cache-weather-and-pause-resume@darthsonic --scope user
```

A mod installed at the user scope from a terminal also loads in the Claude desktop app's Code tab.

**Coming from `cache-wetter`** (the name up to 0.5.0): remove it first, with
`claude plugin uninstall cache-wetter@cache-wetter` and `claude plugin marketplace remove cache-wetter`. Its state file
(`~/.claude/cache-wetter/`) is not carried over and can be deleted.

**After an update, open a new session.** The desktop app hands the mod to a session when the session starts;
`/reload-plugins` does not swap it there. Which version a session runs is written to `codeVersion` in
`~/.claude/cache-weather-and-pause-resume/state.json` at every load.

## Settings

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `de` or `en` for the band, the toasts and the texts Claude gets. `auto` follows `LC_ALL` / `LC_MESSAGES` / `LANG`, then the system locale (on Windows, where `LANG` is usually unset). |
| `askAboveMinutes` | `5` | From which remaining time of a running task Claude asks at a pause. |

Set them with `/plugin configure cache-weather-and-pause-resume@darthsonic`, or in `~/.claude/settings.json`:

```json
"pluginConfigs": {
  "cache-weather-and-pause-resume@darthsonic": { "options": { "language": "en", "askAboveMinutes": 10 } }
}
```

## Sharing the band with other mods

The space above the prompt is one site with a chain of mods. A mod that returns only its own band hides every mod
beneath it in the chain, and the load order — not the mod — decides which comes first. cache-weather-and-pause-resume calls the rest of
the chain and stacks what comes back below its own row, with a row gap that only appears between the two. Another mod
that does the same (for example [savvy-progress](https://github.com/JohnnyVizz/claude-kit) since 1.2.1) shows
together with it in either order.

## Where the values come from

- **Cache lifetime (5 min / 1 h):** from the session's transcript, which records every cache write split by lifetime
  (`ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`); the latest write that wrote anything decides. A
  transcript over 3.5 MiB is not read. On a model switch the switch's own report decides; until the first reading, the
  last session's value is shown with `?`.
- **Hit rate and time of the last response:** from every model request of the main conversation; in a resumed session,
  until its first request, from the session start's report of how long ago the last response was.
- **Context and threshold:** `$.session.usage()`; the threshold from the local estimate (no API request).

## What the mod does on your machine

cache-weather-and-pause-resume makes no network requests of its own and starts no programs. What it hands Claude enters the conversation
like anything else you send:

| What | When | Exactly |
| --- | --- | --- |
| a prompt in your name | you press **Pause** while Claude is idle | the pause request: fixed text from [`hooks/pause.ts`](hooks/pause.ts), with your `askAboveMinutes` |
| a prompt in your name | you press **Resume** | “continue” (in German „weitermachen“) |
| a row in the conversation | you press **Pause** while Claude works, or **Resume** | the pause request; a fixed note that the pause is over, with its length in minutes |
| a note added to your prompt | a pause is requested or on, or you type “pause” or “continue” | a fixed note (the request, “the session is paused”, “the pause is over”); the text you typed is never changed, and no prompt is held back |
| the slash command `/compact` | you press **Compact** while Claude works, or in the desktop app | queued like a typed `/compact`; otherwise the button compacts through the session's own compaction call |
| the Stop hook's answer | Claude stops before it read the pause request | Claude goes on once, with the pause request as the reason |

No file content, transcript text or setting goes into these texts.

**Files.** The mod writes one file, `~/.claude/cache-weather-and-pause-resume/state.json` (below), and no other: no settings,
instructions, hooks or build files. It reads that file, the session's transcript when it is at most 3.5 MiB (for the
cache lifetime and the time of the last response), and the file names — not the contents — in `~/.claude/projects/*/`,
to drop the pauses of deleted sessions.

**Environment and settings.** It reads `USERPROFILE` / `HOME` (where the home folder is) and `LC_ALL` / `LC_MESSAGES`
/ `LANG` (the language). It reads no Claude Code settings and no credentials.

**Hooks.** The `prompt.submit` and `classic.Stop` hooks act as in the table above. Every other hook only reads and
passes its event on unchanged: `classic.SessionStart` (transcript path, session id, time since the last response),
`classic.Stop` (transcript path, running background tasks), `classic.PostModelSwitch` (the cache lifetime),
`turn.step` and `session.measure` (token counts), `turn.start`, `turn.complete`, `session.end`, and
`session.compact`, after which it logs the summary as lines the model does not read. The `ui.render` hook draws the
band and stacks the bands of other mods beneath it.

## State file

`~/.claude/cache-weather-and-pause-resume/state.json` holds the paused sessions (by session id), whether the band is folded, the cache
lifetime last seen and the version last loaded. It keeps at most the 20 latest pauses, and ten seconds after a session
starts it drops the pauses of deleted sessions (no transcript left under `~/.claude/projects/`); when in doubt it drops
nothing. Only the mod reads the file — it never reaches the model and costs no tokens.

## Requirements

Claude Code with mods (function-hook plugins), early access, checked with **2.1.295** and **2.1.296**. The mod API
moves between releases; the CI runs validation and the tests against a pinned version.

Where an organization manages Claude Code, the hooks on `classic.SessionStart`, `classic.Stop`,
`classic.PostModelSwitch` and `session.compact` run only for plugins the organization lists in managed settings. A
self-installed copy then never sees Claude stop, so the pause stays at “Pause requested”, the cache lifetime is not
read off the transcript, and no summary is logged after `/compact`.

## Development

```
claude plugin validate .
claude plugin test .
```

The tests (`tests/`) run in Claude Code's own test kit on the terminal and desktop surfaces and pin the language, so
they do not depend on the machine's locale. A change reaches your own sessions after a version bump in
`.claude-plugin/plugin.json`, `claude plugin update cache-weather-and-pause-resume@darthsonic` and a new session.

## Credits

cache-weather-and-pause-resume is based on an idea by Julian Ivanov ([KI-Automatisierungs-Community](https://ki-automatisierungs-community.de/)).

Written with Claude Code (Claude Opus 5.5); reviewed, tested and maintained by Sven Moderow.

## License

[MIT](LICENSE) © 2026 Sven Moderow
