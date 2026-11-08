# Contributing

Thanks for wanting to help. Bug reports, ideas and pull requests are all welcome, in English or German.
By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Report a bug or suggest an idea

Open an [issue](https://github.com/DarthSonic/cache-weather-and-pause-resume/issues/new/choose) with one of the forms.
For a bug, the versions of the mod and of Claude Code, where the band runs (terminal or desktop app) and a screenshot
of the band help most. A security problem does not belong in a public issue: see [SECURITY.md](SECURITY.md).

## Change the code

The mod runs inside Claude Code (mods are early access); the README's [Requirements](README.md#requirements) name the
version it was last checked with.

1. Fork the repository and clone your fork.
2. Make the change. Where things live:
   - `hooks/register.tsx` registers the hooks and draws the band;
   - `hooks/logic.ts` holds the pure helpers (cache time, bar, keep-warm steps);
   - `hooks/pause.ts` holds the pause request and the `pause_state` tool;
   - `hooks/shutdown.ts` holds the shutdown commands and checks;
   - `hooks/i18n.ts` holds every text the band shows, in German (`DE`) and English (`EN`);
   - `types/index.d.ts` is the contract of the state file.
3. Check it:

   ```
   claude plugin validate --strict .
   claude plugin test .
   ```

   The CI runs both against the pinned Claude Code version. A new behaviour comes with a test in `tests/`.
4. Try it in a real session: `claude --plugin-dir <your clone>` in a terminal loads the mod from the folder for that
   session and reloads it whenever you save a file. Disable an installed copy first (in `/plugin`), so only one band
   runs.
5. Open a pull request against `main`. The template lists what to check.

## Ground rules

- **Both languages.** A text the band shows exists in `DE` and in `EN`. A change to behaviour updates `README.md`
  and `README.de.md`, and adds a line at the top of `CHANGELOG.md`.
- **Nothing hidden.** The README's section [What the mod does on your machine](README.md#what-the-mod-does-on-your-machine)
  lists every text the mod hands Claude, every file it touches and every program it runs. A change to any of that
  updates the section in the same pull request.
- **Programs by full path.** A program the mod starts is called by its full path in the system's own folders, with
  that folder as the working folder, never by a bare name that a file in the session's folder or on `PATH` could
  shadow (see `hooks/shutdown.ts`).
- **No new network requests**, settings files or instructions written outside the mod's own state file.
- The maintainer sets the version number and writes the release.

## License

Contributions are released under the [MIT License](LICENSE) of this repository.
