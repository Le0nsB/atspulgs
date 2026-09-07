# MMM-NewsDetail

Atsevišķa lapa ar ziņām detalizētāk — viena ziņa vienlaikus: avots, laiks,
virsraksts un pilns kopsavilkums (to, ko `bottom_bar` vienrindas josla nerāda).

## Kā tas darbojas

- Ziņas **nenāk no interneta atsevišķi** — modulis klausās `NEWS_FEED`
  notifikāciju no jau esošā `newsfeed` moduļa. Tāpēc `newsfeed` konfigurācijā
  jābūt `broadcastNewsFeeds: true` (tas jau ir iestatīts).
- Bez kursora: ziņas **rotē automātiski** ik pēc `rotateInterval`.
- Ar žestu (MMM-GestureNav ✊ dūre → `NEWSDETAIL_NEXT`) var pāriet uz nākamo
  ziņu; pēc tam rotācija uz `pauseAfterManual` apstājas, lai paspēj izlasīt.

## Navigācija (šajā konfigurācijā)

| Žests | Darbība |
|---|---|
| 3 pirksti | atver šo lapu (`PAGES_GOTO 3`) |
| ✊ dūre | nākamā ziņa (`NEWSDETAIL_NEXT`) |
| ✋ plauksta | atpakaļ uz sākumu |
| bulttaustiņi ← → | lapu pārslēgšana (bez žestiem) |

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `sourceLabel` | `"Ziņas"` | Virsraksts virs ziņas (RSS avota nosaukums) |
| `rotateInterval` | `18000` | Cik ilgi (ms) rāda katru ziņu |
| `pauseAfterManual` | `60000` | Pēc manuālas pārslēgšanas tik ilgi (ms) nerotē |
| `maxDescriptionChars` | `0` | `0` = viss teksts; citādi apgriež ar „…" |
| `nextNotification` | `"NEWSDETAIL_NEXT"` | Notifikācija „nākamā ziņa" |
| `prevNotification` | `"NEWSDETAIL_PREV"` | Notifikācija „iepriekšējā ziņa" |
| `hint` | `"✊ = nākamā ziņa"` | Palīgteksts apakšā |
