## What and why

<!-- What the change does, and the problem it solves. Link the issue if there is one. English or German. -->

## Checked

- [ ] `claude plugin validate --strict .` and `claude plugin test .` pass
- [ ] A new behaviour has a test in `tests/`
- [ ] Texts the band shows exist in German and English (`hooks/i18n.ts`)
- [ ] `README.md` and `README.de.md` describe the change, and `CHANGELOG.md` has a line for it
- [ ] If the change touches what the mod hands Claude, the files it writes or the programs it runs: the README's
      section "What the mod does on your machine" says so
- [ ] Tried in a session (`claude --plugin-dir <clone>`): terminal, desktop app, or both (say which)
