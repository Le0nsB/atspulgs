# MMM-DailyVerse

Rāda dienas tekstu — tautasdziesmu, pantiņu vai joku. Pilnībā lokāls: visi
teksti nāk no `items` saraksta konfigurācijā, interneta pieslēgums nav vajadzīgs.

## Režīmi

| `mode` | Uzvedība |
|---|---|
| `"daily"` (noklusējums) | Teksts mainās reizi dienā (pēc dienas kārtas numura gadā). Pusnaktī pārzīmē pats. |
| `"random"` | Nejaušs teksts pie katras pārzīmēšanas; ja `updateInterval > 0`, mainās arī pa to intervālu. |

`items` elements var būt teksta virkne (atļauts `<br>` rindas pārnesumam) vai
objekts `{ text: "..." }`.

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `mode` | `"daily"` | `"daily"` vai `"random"` |
| `updateInterval` | `0` | ms; ja `> 0` un `mode: "random"`, cik bieži mainīt tekstu |
| `className` | `"small light"` | MagicMirror teksta klases |
| `items` | (iebūvēts saraksts) | Tekstu masīvs — pārraksti ar saviem |

## Piemērs

```js
{
    module: "MMM-DailyVerse",
    position: "lower_third",
    config: {
        mode: "daily",
        items: [
            "Nāc ar sauli, ej ar sauli,<br>Tad saulīte līdzi tek.",
            "— Ko tu dari? — Neko.<br>— Bet vakar tu jau to darīji! — Nebiju pabeidzis."
        ]
    }
}
```
