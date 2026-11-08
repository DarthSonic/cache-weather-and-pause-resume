# Security policy

## Supported versions

Only the [latest release](https://github.com/DarthSonic/cache-weather-and-pause-resume/releases/latest) gets fixes.
Update to it before you report, if you can.

## What matters here

The mod runs inside Claude Code with your rights. The README's section
[What the mod does on your machine](README.md#what-the-mod-does-on-your-machine) lists everything it does; a way to
make it do more is a security problem, for example:

- it starts a program other than the ones listed there, or one found through the session's folder or `PATH`;
- the computer shuts down without a press of **Shutdown**, or the countdown cannot be cancelled;
- a text the mod hands Claude carries content of a file, a transcript or a setting, or lets another party steer Claude;
- it writes outside `~/.claude/cache-weather-and-pause-resume/`, or keep-warm sends a request anywhere but through
  the session's own client.

## Report a vulnerability

Do not open a public issue. Report it privately through GitHub:
[Report a vulnerability](https://github.com/DarthSonic/cache-weather-and-pause-resume/security/advisories/new)
(the **Security** tab, then **Report a vulnerability**). Say what you found, the versions of the mod and Claude Code,
your operating system and the steps that show it.

The mod is maintained by one person in their spare time. You will get an answer, and once a fix is released the
advisory is published with credit to you, unless you prefer not to be named.

A problem in Claude Code itself belongs to Anthropic, not to this repository.
