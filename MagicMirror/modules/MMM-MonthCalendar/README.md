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
- **Personīgie notikumi** no [MMM-GoogleCalendar](../MMM-GoogleCalendar/README.md)
  tiek rādīti atsevišķi no svētkiem — zilā krāsā, ar sākuma laiku, un diena
  iezīmēta ar zilu malu.
- Režģis turpinās ar **nākamā mēneša dienām** (vismaz līdz nedēļas beigām un
  vismaz `minDaysAhead` dienas pēc šodienas), lai mēneša beigās redz arī
  nākamās nedēļas plānus.
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
| `personalSources` | `["MMM-GoogleCalendar"]` | Moduļi, kuru notikumi ir personīgie plāni (zilā krāsā), nevis svētki |
| `maxPersonalPerDay` | `2` | Cik personīgos notikumus rādīt vienā šūnā (pārējie kā „+N") |
| `minDaysAhead` | `7` | Cik dienas pēc šodienas vienmēr redzamas režģī |
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
