# MMM-Routines

Mājas treniņi spogulim. Atsevišķa **lapa** rāda šodienas treniņu; ko trenēt un
kāds inventārs ir pieejams, izvēlas **telefonā**. Ja treniņš nepatīk — vienā
pieskārienā uzģenerē citu. Kad kāds pienāk pie spoguļa, tas pajautā, vai
treniņš ir pabeigts, un pēc atbildes pielāgo nākamo treniņu sarežģītību.

Viss strādā lokāli: vingrinājumu datubāze ir `exercises.js`, nekādu API
atslēgu vai interneta nevajag.

## Kā tas strādā

1. **Izvēle telefonā:** atver `http://<pi-ip>:8080/routines` (adresi redzēsi arī
   pašā treniņu lapā), atzīmē ķermeņa daļas (krūtis, mugura, pleci, rokas,
   vēders, kājas vai viss ķermenis) un inventāru (hanteles, stienis,
   pievilkšanās stienis, jogas bumba, gumijas lente, svaru bumba, sols/krēsls;
   ķermeņa svara vingrinājumi ir vienmēr) un spied **Ģenerēt treniņu**.
2. **Ģenerēt citu:** tā pati poga telefonā (vai spoguļa lapā tas ir tikai
   skatījums). Jaunais treniņš cenšas neatkārtot iepriekšējā vingrinājumus.
   **Demonstrācija:** 57 no 109 vingrinājumiem ir īsa divu kadru animācija
   (sākuma un beigu poza) — gan uz spoguļa lapas, gan telefonā (pieskāries, lai
   palielinātu). Attēli ir lokāli (`public/media/`), tāpēc strādā bez interneta.
   Avots: [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
   (Unlicense / public domain), samazināti līdz 360 px; sakritības ir tikai
   drošas (`MEDIA` failā `exercises.js`). Pārējiem vingrinājumiem telefonā ir
   saite uz YouTube meklējumiem.
3. **Katru dienu jauns treniņš:** jaunā dienā spogulis pats uzģenerē treniņu no
   pēdējām izvēlēm.
4. **Jautājums pie spoguļa:** kad `MMM-FaceRecognition` konstatē, ka kāds
   pienācis (`FACE_PRESENT`), spogulis pajautā, vai šodienas treniņš ir
   pabeigts — **ne biežāk kā reizi stundā** (`promptCooldownMs`) un tikai ja
   treniņš vēl nav pabeigts. Pauze tiek glabāta serverī, tāpēc pārstartēšana to
   neatiestata.
5. **Atbilde ar balsi** (`MMM-VoiceCommands`, ~8 s pēc aktivācijas vārda):
   - „Spoguli, **treniņš pabeigts**” → spogulis jautā, kā veicās
   - „Spoguli, **par vieglu** / **tieši laikā** / **par grūtu**”
   - „Spoguli, **vēl ne**” → aizver jautājumu
   - „Spoguli, **parādi treniņu**” → treniņu lapa

   To pašu var izdarīt telefona lapā (**Pabeigts ✓** un atbilžu pogas).
6. **Līmenis:** treniņu sarežģītība ir 1–10. **Par vieglu** → līmenis +1
   (vairāk vingrinājumu, sēriju un atkārtojumu, īsāka atpūta, grūtāki
   varianti); **par grūtu** → −1; **tieši laikā** → nemainās. Jaunais līmenis
   attiecas uz nākamajiem treniņiem.

## Uzstādīšana

`config/config.js`:

```js
{
	module: "MMM-Routines",
	position: "middle_center",
	config: {}
}
```

Pievieno arī kā lapu `MMM-Pages` sarakstā (šobrīd 5. lapa, indekss 5):

```js
pages: [ /* ... */, ["MMM-Routines"] ]
```

Jautājums pie spoguļa parādās neatkarīgi no aktīvās lapas (tas ir
pārklājums virs visa), tāpēc modulis nav jāliek `fixed` sarakstā.

Vajag arī `MMM-FaceRecognition` (tas raida `FACE_PRESENT`) un
`MMM-VoiceCommands` ar treniņu komandām (tās ir noklusējumā — ja `config.js`
pārrakstīji `commands`, pievieno tās no README.md).

## Poga tālvadībā

`MMM-Remote-Control` sākumizvēlnē ir poga **Treniņi**, kas atver `/routines`
(un treniņu lapā augšā ir „← Tālvadība”). Tas strādā ar `config/custom_menu.json`
un `customMenu: "custom_menu.json"` Remote-Control konfigurācijā. Šī projekta
Remote-Control kopijai pievienots jauns izvēlnes elementa tips `link`
(`remote/remote-menu-ui.mjs`, `addLinkClickHandler`) — ja atjaunini
MMM-Remote-Control no upstream, šī izmaiņa jāatjauno (un jāpaceļ `CACHE_NAME`
`service-worker.js`).

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `promptCooldownMs` | `3600000` | minimālais starplaiks starp jautājumiem pie spoguļa (1 h) |
| `promptDurationMs` | `40000` | cik ilgi jautājums paliek redzams |
| `resultDurationMs` | `8000` | cik ilgi rāda apstiprinājumu pēc atbildes |

## Notifikācijas

| Notifikācija | payload | Darbība |
|---|---|---|
| `FACE_PRESENT` | — | (no MMM-FaceRecognition) pajautā par treniņu, ja pagājusi pauze |
| `ROUTINES_COMPLETE` | — | treniņš pabeigts |
| `ROUTINES_FEEDBACK` | `"easy"` / `"ok"` / `"hard"` | atbilde, kā veicās |
| `ROUTINES_DISMISS` | — | aizver jautājumu |

## Dati un drošība

- Stāvoklis (izvēles, šodienas treniņš, līmenis, vēsture) tiek glabāts
  `data.json` moduļa mapē (nav git'ā, katrai ierīcei sava).
- Telefona lapai nav paroles — to aizsargā tikai MagicMirror `ipWhitelist`
  (šeit atļauts tikai lokālais tīkls). Ja tas nepatīk, neatver portu ārpus tīkla.
- API: `GET /routines/api/state`, `POST /routines/api/generate`
  (`{targets, equipment}`; bez lauka izmanto saglabātās izvēles),
  `POST /routines/api/complete`, `POST /routines/api/feedback` (`{feedback}`).

## Vingrinājumu pievienošana

`exercises.js` → `EXERCISES`: rinda formātā
`E(id, nosaukums, [ķermeņa daļas], [inventārs (kāds no)], sarežģītība 1–3, "reps"|"time", bāzes vērtība, katrā pusē?)`.
