# MMM-Namedays

Rāda šodienas latviešu **vārda dienas**. Pilnībā lokāls — visi dati ir iekļauti
modulī ([`namedays.data.js`](namedays.data.js)), interneta pieslēgums nav
vajadzīgs. Pusnaktī teksts automātiski pāriet uz nākamās dienas vārdiem.

## Kā tas darbojas

- `namedays.data.js` ievieto `window.MMM_NAMEDAYS_DATA` ar diviem sarakstiem:
  `traditional` (tradicionālais kalendārs) un `extended` (paplašinātais).
  Atslēga ir `"MM-DD"`, vērtība — vārdu masīvs.
- To pašu datni izmanto arī [MMM-MonthCalendar](../MMM-MonthCalendar/README.md).

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `useExtended` | `false` | `false` = tradicionālais kalendārs, `true` = paplašinātais saraksts (ar retākiem vārdiem) |
| `prefix` | `""` | Teksts pirms vārdiem, piem. `"Šodien svin: "` |
| `separator` | `", "` | Atdalītājs starp vārdiem |
| `emptyText` | `"Šodien nav vārda dienu"` | Ko rādīt dienās bez vārda dienas (piem. 29. februāris) |
| `updateOnMidnight` | `true` | Automātiski pārzīmēt pusnaktī |

## Piemērs

```js
{
    module: "MMM-Namedays",
    header: "Vārda diena",
    position: "top_left",
    config: {
        useExtended: false,
        prefix: ""
    }
}
```
