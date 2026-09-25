# MMM-CalendarAgenda

Pilnas lapas saraksts ar **plānotajiem notikumiem** no Google kalendāra
nākamajām dienām, sagrupēts pa dienām („Šodien", „Rīt", „Pirmdiena,
28. septembris · pēc 3 d."). Notiekošie notikumi atzīmēti ar „Tagad",
beigušies pazūd.

## Kā tas darbojas

Modulis pats neko neielādē — tas klausās `CALENDAR_EVENTS`, ko pārraida
[MMM-GoogleCalendar](../MMM-GoogleCalendar/README.md). Tāpēc MMM-GoogleCalendar
jābūt konfigurācijā (arī uz citas lapas) un pieslēgtam. Iebūvētā `calendar`
moduļa notikumi (piem. „Brīvdienas Latvijā") tiek ignorēti — skat. `sources`.

Balss komanda: „kas plānots" / „parādi plānus" (MMM-VoiceCommands).

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `daysAhead` | `14` | Cik dienas uz priekšu rādīt (ne vairāk kā MMM-GoogleCalendar `maximumNumberOfDays`) |
| `maxEntries` | `14` | Maksimālais rindu skaits, lai saraksts ietilpst ekrānā |
| `sources` | `["MMM-GoogleCalendar"]` | Kuru moduļu `CALENDAR_EVENTS` rādīt |
| `header` | `"Plānotais"` | Virsraksts |

## Piemērs

```js
{
    module: "MMM-CalendarAgenda",
    position: "middle_center",
    config: { daysAhead: 14 }
}
```
