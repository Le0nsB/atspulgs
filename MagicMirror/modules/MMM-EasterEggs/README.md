# MMM-EasterEggs

Pilnekrāna pārsteigumi pa virsu visam spogulim. Modulim nav sava satura uz
ekrāna (bez `position`); efekti tiek pievienoti tieši `document.body` ar
`pointer-events: none`, tāpēc neko nebloķē.

| Notifikācija | Efekts | Kā izsaukt |
|---|---|---|
| `EASTEREGG_GLITTER` | No augšas ~5 s krīt mirdzoši vizuļi, tad izgaist | Balss: „Spoguli, spoguli, saki man tā” (MMM-VoiceCommands) |
| `EASTEREGG_EXPLOSION` | Sprādziens pa visu ekrānu (~2 s) ar uzplaiksnījumu un trīcēšanu | Žests: vidējais pirksts (MMM-GestureNav `middleFinger`) |

Kamēr efekts vēl notiek, atkārtots izsaukums tiek ignorēts.

## Konfigurācija

```js
{ module: "MMM-EasterEggs" }
```

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `glitterMs` | `4500` | Cik ilgi krīt jauni vizuļi |
| `glitterFadeMs` | `2500` | Cik ilgi pēc tam atlikušie izgaist |
| `glitterCount` | `260` | Vizuļu skaits vienlaikus |
| `explosionMs` | `2030` | Sprādziena ilgums (viens animācijas cikls) |
| `explosionScale` | `1.3` | Sprādziena izmērs attiecībā pret ekrānu |

## Sprādziena attēls

`explosion.webp` ir caurspīdīgs animēts WebP, kas iegūts no zaļā ekrāna GIF:
zaļais fons izgriezts, zaļā atblāzma noņemta un „MakeAGIF.com” ūdenszīme
izdzēsta. Lai aizstātu ar citu zaļā ekrāna GIF (vajag Python + Pillow):

```sh
python3 tools/make-explosion.py cits.gif explosion.webp
```

Ja jaunajam GIF ir cits kadru skaits, pielāgo `explosionMs`.
