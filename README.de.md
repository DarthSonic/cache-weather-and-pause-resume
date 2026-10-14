# cache-wetter

[![CI](https://github.com/DarthSonic/cache-wetter/actions/workflows/ci.yml/badge.svg)](https://github.com/DarthSonic/cache-wetter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*English: [README.md](README.md)*

Ein Mod für [Claude Code](https://code.claude.com): eine schmale Leiste direkt über dem Eingabefeld. Sie zeigt, wie
warm der Prompt-Cache noch ist und wie voll der Kontext, mit einem **Compact**-Knopf und einem Knopf
**Pause / Weitermachen**, der Claude Laufendes zu Ende bringen, den Stand sichern und warten lässt.

![Die Leiste von cache-wetter in der Claude-Desktop-App: Cache noch 60 Minuten, Hits 100 %, Gewitter bei 87 % einer Schwelle von 97 %, Compact hervorgehoben, der Pause-Knopf](docs/band.png)

## Was die Leiste zeigt

| Teil | Was er zeigt |
| --- | --- |
| **Cache** | Restzeit des Prompt-Caches in Minuten (`m`) ab der letzten Antwort, mit 20 Kästchen, die leerlaufen; grün, im letzten Viertel gelb, in den letzten 10 % rot, bei 0 „abgelaufen“. Jede Minute neu gezeichnet. |
| **Hits** | Anteil der Input-Tokens der letzten Antwort, der aus dem Cache kam. |
| **Wetter** | ☀️ bis zur Hälfte der Auto-Compact-Schwelle, 🌧️ bis 80 % davon, ⛈️ darüber. |
| **Ctx / Max** | Füllung des Kontexts in Prozent und die Auto-Compact-Schwelle (`*` = Ersatzwert 83 %, wenn die Sitzung keine meldet). |
| **Compact** | Wie `/compact`; bei ⛈️ hervorgehoben. In der Desktop-App oder während Claude arbeitet wird `/compact` eingereiht. |
| **⏸ Pause / ▶ Weitermachen** | Bittet Claude, die Sitzung zu pausieren, und setzt sie fort (unten). Auch zugeklappt sichtbar. |
| **▾ / ▸** | Klappt die Leiste auf Wetter, Cache-Restzeit, Ctx und den Pause-Knopf zu. Bleibt über Sitzungen erhalten. |

Nach `/compact` (oder dem Knopf) schreibt der Mod die Tokens vorher und nachher und die Zusammenfassung, mit der Claude
weitermacht, als Log-Zeilen, die das Modell nicht liest.

## Der Pause-Knopf

| Zustand | Leiste | Was passiert |
| --- | --- | --- |
| läuft | `⏸ Pause` | Ein Klick schickt Claude die Pause-Bitte. |
| Pause angefordert | `⏳ Pause angefordert · 2 Tasks laufen noch` | Claude lässt Laufendes zu Ende laufen, fragt bei langen Tasks nach und sichert den Stand. Getipptes „weitermachen“ nimmt die Bitte zurück. |
| pausiert | `▶ Weitermachen` · `pausiert seit 12 m` | Claude wartet. Ein Klick schickt „weitermachen“, genau wie getippt. |

Tippen geht auch: eine Nachricht, die nur „pausieren“ (oder „pause“) ist, pausiert; eine, die mit „weitermachen“ (oder
„continue“, „resume“) beginnt, setzt fort. Beide Sprachen werden verstanden, egal in welcher der Mod gerade spricht.

Die Bitte an Claude (der genaue Text steht in [`hooks/pause.ts`](hooks/pause.ts)):

1. Nichts Neues mehr starten; was läuft, läuft zu Ende.
2. Je laufendem Hintergrund-Task (Läufe, Agenten, Monitore, Workflows) die Restlaufzeit schätzen. Länger als die
   Schwelle (Standard **5 Minuten**, Option `askAboveMinutes`) oder ohne absehbares Ende: per Dialog fragen, mit
   Restlaufzeit je Task, ob er jetzt beendet und nach „weitermachen“ neu gestartet (nur, wenn er das zulässt) oder zu
   Ende gefahren wird. Kürzere Tasks wartet Claude einfach ab.
3. Den Stand nach den Regeln des Projekts sichern (CLAUDE.md, Memory): erledigt, gelaufen, abgebrochen samt Neustart,
   nächster Schritt. Ohne Projektregel nichts verwerfen und nicht ungefragt committen.
4. Kurz „Pausiert“ melden und warten. Geplante Weckungen (Cron, `/loop`) laufen in der Pause nicht.

Bei „weitermachen“ bekommt Claude den Hinweis, am gesicherten Stand fortzusetzen und Abgebrochenes neu zu starten. Eine
andere Nachricht in der Pause wird beantwortet, ohne die pausierte Arbeit wieder aufzunehmen.

Wie der Mod den Zustand verfolgt:

- **Klick, während Claude arbeitet:** die Bitte kommt als Zeile in den laufenden Zug, Claude liest sie bei der nächsten
  Anfrage (nach dem gerade laufenden Werkzeugaufruf). Endet der Zug vorher, hält der Stop-Hook das Anhalten auf und
  reicht die Bitte weiter; nach einem abgebrochenen Zug trägt die nächste Nachricht sie.
- **Klick, während Claude ruht:** die Bitte geht als Prompt mit deinen Worten.
- **Pausiert** ist die Sitzung, sobald Claude anhält und der Stop-Hook keine Hintergrund-Arbeit mehr meldet. Laufen
  noch Tasks, zählt die Leiste sie.
- Eine Pause wird je Sitzung in `~/.claude/cache-wetter/state.json` gemerkt: eine pausierte Sitzung, die wieder
  geöffnet wird (Neustart der App, fortgesetzte Sitzung), zeigt wieder **Weitermachen**. `/clear` hebt die Pause auf.

## Installation

Im Eingabefeld einer Claude-Code-Sitzung im Terminal:

```
/plugin install cache-wetter --marketplace DarthSonic/cache-wetter
```

Mit `y` den Marketplace hinzufügen und einen Bereich wählen (Benutzer: alle Projekte). Dasselbe aus einer Shell:

```
claude plugin marketplace add DarthSonic/cache-wetter
claude plugin install cache-wetter@cache-wetter --scope user
```

Ein Mod, der im Terminal für den Benutzer-Bereich installiert wurde, lädt auch im Code-Tab der Claude-Desktop-App.

**Nach einem Update eine neue Sitzung öffnen.** Die Desktop-App reicht den Mod beim Start der Sitzung herein;
`/reload-plugins` tauscht ihn dort nicht aus. Welche Fassung eine Sitzung ausführt, steht bei jedem Laden als
`codeVersion` in `~/.claude/cache-wetter/state.json`.

## Einstellungen

| Option | Standard | Wirkung |
| --- | --- | --- |
| `language` | `auto` | `de` oder `en` für Leiste, Meldungen und die Texte an Claude. `auto` folgt Claudes Einstellung `language`, dann `LC_ALL` / `LC_MESSAGES` / `LANG`, dann der Systemsprache (unter Windows, wo `LANG` meist leer ist). |
| `askAboveMinutes` | `5` | Ab welcher Restlaufzeit eines laufenden Tasks Claude bei einer Pause nachfragt. |

Setzen mit `/plugin configure cache-wetter@cache-wetter` oder in `~/.claude/settings.json`:

```json
"pluginConfigs": {
  "cache-wetter@cache-wetter": { "options": { "language": "de", "askAboveMinutes": 10 } }
}
```

## Die Leiste teilen

Der Platz über dem Eingabefeld ist ein Platz mit einer Kette von Mods. Ein Mod, der nur seine eigene Leiste
zurückgibt, verdeckt alles unter ihm in der Kette, und welcher Mod oben steht, entscheidet die Lade-Reihenfolge, nicht
der Mod. cache-wetter ruft den Rest der Kette und setzt dessen Leiste unter die eigene Zeile, mit einem Abstand, der
nur zwischen den beiden entsteht. Ein anderer Mod, der es genauso macht (etwa
[savvy-progress](https://github.com/JohnnyVizz/claude-kit) seit 1.2.1), erscheint in jeder Reihenfolge mit ihm
zusammen.

## Woher die Werte kommen

- **Cache-Laufzeit (5 min / 1 h):** aus dem Transkript der Sitzung, das jede Cache-Schreibung getrennt nach Laufzeit
  meldet (`ephemeral_5m_input_tokens`, `ephemeral_1h_input_tokens`); die letzte, die etwas schrieb, entscheidet. Ist das
  Transkript größer als 3,5 MiB, liest der Mod nur seine letzten 40 Zeilen. Bei einem Modellwechsel entscheidet dessen
  Meldung; bis zur ersten Ablesung gilt der Wert der letzten Sitzung, mit `?`.
- **Trefferquote und Zeitpunkt der letzten Antwort:** aus jeder Modellanfrage der Hauptunterhaltung.
- **Kontext und Schwelle:** `$.session.usage()`; die Schwelle aus der lokalen Schätzung (keine API-Anfrage).

## Zustandsdatei

`~/.claude/cache-wetter/state.json` hält die pausierten Sitzungen (je Sitzungs-ID), ob die Leiste zugeklappt ist, die
zuletzt gesehene Cache-Laufzeit und die zuletzt geladene Fassung. Sie behält höchstens die 20 jüngsten Pausen, und zehn
Sekunden nach einem Sitzungsstart fallen die Pausen gelöschter Sitzungen heraus (kein Transkript mehr unter
`~/.claude/projects/`); im Zweifel bleibt alles stehen. Die Datei liest nur der Mod — sie gelangt nie zum Modell und
kostet keine Token.

## Voraussetzungen

Claude Code mit Mods (Plugins mit Funktions-Hooks), Early Access, geprüft mit **2.1.295** und **2.1.296**. Die
Mod-Schnittstelle ändert sich zwischen Releases; die CI prüft und testet gegen eine festgeschriebene Version.

Wo eine Organisation Claude Code verwaltet, laufen die Hooks auf `classic.SessionStart`, `classic.Stop`,
`classic.PostModelSwitch` und `session.compact` nur für Plugins, die die Organisation in den verwalteten Einstellungen
nennt. Eine selbst installierte Kopie sieht dann nie, dass Claude anhält: die Pause bleibt bei „Pause angefordert“, die
Cache-Laufzeit wird nicht aus dem Transkript gelesen, und nach `/compact` erscheint keine Zusammenfassung.

## Entwicklung

```
claude plugin validate .
claude plugin test .
```

Die Tests (`tests/`) laufen im Test-Kit von Claude Code auf den Oberflächen Terminal und Desktop und legen die Sprache
fest, damit sie nicht von der Locale des Rechners abhängen. Eine Änderung erreicht die eigenen Sitzungen nach einer
höheren Version in `.claude-plugin/plugin.json`, `claude plugin update cache-wetter@cache-wetter` und einer neuen
Sitzung.

## Danksagung

cache-wetter basiert auf einer Idee von Julian Ivanov ([KI-Automatisierungs-Community](https://ki-automatisierungs-community.de/)).

## Lizenz

[MIT](LICENSE) © 2026 Sven Moderow
