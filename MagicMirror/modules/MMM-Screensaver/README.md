# MMM-Screensaver

Pilnekrāna ekrānsaudzētājs priekš MagicMirror² ar **vairākām "sejām"**, kas
rotē cita pēc citas, kamēr ekrāns ir neaktīvs:

1. **Matrix** — krītošs zaļš digitālais lietus.
2. **Pulkstenis** — liels digitālais pulkstenis ar datumu, LCD septiņu segmentu burtiem (DSEG7 Classic, SIL OFL — `fonts/`).
3. **Ikosaedrs** — lēni rotējošs 3D stiepļu karkass.

Pēc noteikta neaktivitātes laika (pēc noklusējuma 1 minūte) aizsedz visu
ekrānu. Jebkura mijiedarbība to paslēpj un no jauna sāk skaitīt laiku.
Kamēr ekrānsaudzētājs aktīvs, ik pēc `screensaverDuration` pāriet uz
nākamo sarakstā `screensavers`, tad atkal no sākuma.

Aizstāj **MMM-MatrixScreensaver** — Matrix efekts ir viena no šī moduļa
sejām, tāpēc vecais modulis vairs nav vajadzīgs (nomainīts `config.js`).

## Kas skaitās par "mijiedarbību"

Tāpat kā iepriekš MMM-MatrixScreensaver:

- **Pele / tastatūra / pieskāriens / ritenītis** tieši pārlūkā/displejā
  (`activityEvents`).
- **Citu moduļu notifikācijas** no `activityNotifications` saraksta — žesti,
  balss komandas, tālvadība, lapu maiņa.
- Ja izmanto **MMM-Remote-Control** klātbūtnes sensoru: `USER_PRESENCE` ar
  `true` pamodina ekrānu (`respectUserPresence`).

Periodiskās sistēmas notifikācijas (pulkstenis, laikapstākļi, ziņu plūsma
u.tml.) **netiek** uzskatītas par mijiedarbību.

## Uzstādīšana

```js
{
	module: "MMM-Screensaver",
	position: "fullscreen_above",   // svarīgi — sedz visu ekrānu
	config: {
		timeout: 60 * 1000,
		screensavers: ["matrix", "clock", "icosahedron"],
		screensaverDuration: 45 * 1000
	}
},
```

> **Ar MMM-Pages:** pievieno `"MMM-Screensaver"` `fixed` sarakstam, citādi
> lapu pārslēgšana to paslēps.

## Konfigurācija

| Opcija | Noklusējums | Apraksts |
| --- | --- | --- |
| `timeout` | `60000` | Neaktivitātes laiks (ms) līdz ekrānsaudzētājam. |
| `fadeSpeed` | `1200` | Parādīšanās/paslēpšanās ilgums (ms). |
| `dimOtherModules` | `true` | Aiz ekrānsaudzētāja paslēpj pārējos moduļus. |
| `respectUserPresence` | `true` | Ņem vērā `USER_PRESENCE` notifikāciju. |
| `activityEvents` | `["mousemove","mousedown","touchstart","keydown","wheel"]` | DOM notikumi, kas skaitās par mijiedarbību. |
| `activityNotifications` | skat. avotu | Moduļu notifikācijas, kas pamodina ekrānu. |
| `ignoreNotifications` | `[]` | Notifikācijas, ko nekad neskaitīt (pat ja augšējā sarakstā). |
| `debug` | `false` | Papildu logi konsolē. |
| `screensavers` | `["matrix","clock","icosahedron"]` | Kārtība, kādā sejas rotē. Var izlaist kādu vai atstāt tikai vienu. |
| `screensaverDuration` | `45000` | Cik ilgi (ms) rāda katru seju, pirms pāriet uz nākamo. `0` = nerotē (paliek pie pirmās). |
| `randomOrder` | `false` | `true` = nākamā seja izvēlēta nejauši, nevis pēc `screensavers` kārtas. |
| `matrix.fps` | `30` | Matrix animācijas kadru ātrums. |
| `matrix.fontSize` | `18` | Glifu izmērs px. |
| `matrix.color` | `"#00ff41"` | Lietus krāsa. |
| `matrix.headColor` | `"#d7ffe0"` | Spožā "galva" kolonnas priekšgalā. |
| `matrix.trailFade` | `0.06` | Cik ātri dziest pēdas. |
| `matrix.glowBlur` | `6` | Mirdzuma rādiuss ap glifiem (`0` = izslēgts). |
| `matrix.characters` | katakana + cipari + simboli | Rakstzīmju kopa. |
| `clock.color` | `"#00e5ff"` | Pulksteņa teksta krāsa. |
| `clock.glowBlur` | `20` | Mirdzuma rādiuss ap tekstu (`0` = izslēgts). |
| `clock.showSeconds` | `true` | Rādīt sekundes. |
| `clock.showDate` | `true` | Rādīt datumu zem laika. |
| `icosahedron.fps` | `30` | Animācijas kadru ātrums. |
| `icosahedron.color` | `"#8a5cff"` | Karkasa krāsa. |
| `icosahedron.glowBlur` | `10` | Mirdzuma rādiuss (`0` = izslēgts). |
| `icosahedron.rotationSpeed` | `0.25` | Rotācijas ātrums (rad/s ap Y asi; X ass rotē 0.4x lēnāk). |
| `icosahedron.size` | `0.32` | Rādiuss kā daļa no `min(platums, augstums)`. |

## Veiktspēja uz Raspberry Pi

Ja kāda seja raustās: samazini attiecīgās sejas `fps` (piem. `20`), Matrix
gadījumā palielini `fontSize` (piem. `22`), vai izslēdz `glowBlur` (`0`).
Vienlaikus darbojas tikai vienas sejas animācija — pārējās ir apturētas.
