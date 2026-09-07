# MMM-MonthCalendar

Tekošā mēneša kalendārs režģī. Katrā datumā redzama arī tās dienas **vārda
diena(s)**, bet **svētku dienas** izceltas un parakstītas.

## Kā tas darbojas

- **Vārda dienas** nāk no [MMM-Namedays](../MMM-Namedays/README.md) datnes
  (`../MMM-Namedays/namedays.data.js`) — tāpēc MMM-Namedays ir jābūt instalētam.
  Ja datne netiek ielādēta, kalendārs joprojām strādā, tikai bez vārdiem
  (par to tiek izvadīts brīdinājums žurnālā).
- **Svētki** nāk no MagicMirror iebūvētā `calendar` moduļa caur
  `CALENDAR_EVENTS` notifikāciju. Lai kalendārā redzētu jau **pagājušos** šī
  mēneša svētkus, pievieno atsevišķu (neredzamu) `calendar` instanci ar
  `broadcastPastEvents: true` — skat. `config/config.js`.
- Vairākas `calendar` instances tiek apvienotas un dublikāti noņemti.
- Visas dienas notikumiem iCal beigu datums ir izslēdzošs, tāpēc modulis
  atņem vienu dienu (piem. svētdienas svētki neieķeksē pirmdienu).

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `firstDayOfWeek` | `1` | Nedēļas pirmā diena (`1` = pirmdiena, `0` = svētdiena) |
| `useExtended` | `false` | Vārdu saraksts — saskaņā ar MMM-Namedays |
| `maxNamesPerDay` | `2` | Cik vārdu rādīt vienā šūnā |
| `showNamedays` | `true` | Rādīt vārda dienas |
| `showHolidays` | `true` | Rādīt svētkus no `calendar` moduļa |
| `maxHolidaysPerDay` | `2` | Cik svētku nosaukumu rādīt vienā šūnā |
| `updateOnMidnight` | `true` | Automātiski pārzīmēt pusnaktī (mainās „šodiena") |
| `weekdayLabels` | `["Pr","Ot","Tr","Ce","Pk","Se","Sv"]` | Nedēļas dienu galvenes (pirmdien–svētdien) |
| `monthLabels` | `["Janvāris", …, "Decembris"]` | Mēnešu nosaukumi virsrakstam |

## Piemērs

```js
{
    module: "MMM-MonthCalendar",
    position: "middle_center",
    config: {}
}
```
