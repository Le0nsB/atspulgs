# MMM-Pages

Vienkāršs **lapu pārslēdzējs**. Katrā lapā redzami tikai tie moduļi, kas
norādīti `pages` sarakstā; `fixed` moduļi redzami vienmēr (pulkstenis, brīdinājumi u.tml.).

Pilnībā lokāls, interneta pieslēgums nav vajadzīgs.

> Piezīme: šis ir minimāls, projektam pielāgots pārslēdzējs, nevis populārais
> [edward-shen/MMM-pages](https://github.com/edward-shen/MMM-pages). Notifikāciju
> nosaukumi (`PAGES_*`) sakrīt, tāpēc citi moduļi (piem. MMM-GestureNav,
> MMM-VoiceCommands) darbojas ar abiem.

## Vadība

- **Bulttaustiņi ← →** (ja `useArrowKeys: true`).
- **Notifikācijas** no citiem moduļiem:

| Notifikācija | `payload` | Darbība |
|---|---|---|
| `PAGES_NEXT` | — | Nākamā lapa |
| `PAGES_PREV` | — | Iepriekšējā lapa |
| `PAGES_HOME` | — | Sākuma lapa (`config.home`) |
| `PAGES_GOTO` | `n` | Lapa ar indeksu `n` |

Pēc pārslēgšanās modulis raida `PAGE_CHANGED` ar jauno lapas indeksu.

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `pages` | `[]` | Masīvu masīvs — katrā elementā tās lapas moduļu nosaukumi |
| `fixed` | `[]` | Moduļi, kas redzami visās lapās |
| `home` | `0` | Sākuma lapas indekss (uz to ved `PAGES_HOME`) |
| `useArrowKeys` | `true` | Klausīties kreiso/labo bulttaustiņu |
| `wrap` | `true` | No pēdējās lapas ar „uz priekšu" atgriezties pirmajā |
| `animationTime` | `400` | Pārejas ilgums (ms) |

## Piemērs

```js
{
    module: "MMM-Pages",
    config: {
        home: 1,
        fixed: ["clock", "alert", "updatenotification", "MMM-GestureNav", "MMM-VoiceCommands"],
        pages: [
            ["MMM-WeekWeather"],
            ["calendar", "MMM-Namedays", "compliments", "weather", "newsfeed"],
            ["MMM-MonthCalendar"],
            ["MMM-NewsDetail"]
        ]
    }
}
```
