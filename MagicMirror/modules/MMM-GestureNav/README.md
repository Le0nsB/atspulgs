# MMM-GestureNav

Roku žestu navigācija MagicMirror² lapām. Izmanto tīmekļa kameru un
[MediaPipe HandLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
(darbojas lokāli — modelis un WASM tiek iekļauti modulī pēc `npm install`).
Žestus aprēķina pats modulis no 21 rokas punkta.

**Statiski žesti** — parādi žestu un turi nekustīgi ~0,5 s (nav jākustina roka):

| Žests | Notifikācija (noklusējums) | Efekts |
| --- | --- | --- |
| 1 pirksts | `PAGES_GOTO` payload `0` | nedēļas laika lapa |
| 2 pirksti | `PAGES_GOTO` payload `2` | mēneša kalendāra lapa |
| Atvērta plauksta | `PAGES_HOME` | sākuma lapa |

"Pirksti" = izstiepti rādītājs/vidējais/zeltnesis/mazais (īkšķis netiek skaitīts).
Pēc katra žesta ir `cooldownMs` pauze; lai to pašu žestu izmantotu vēlreiz,
starplaikā jāparāda cits žests vai jānolaiž roka.

**Aktīvā zona.** Lai gar sāniem nolaistas rokas nejauši nenostrādātu, žests tiek
lasīts tikai tad, ja roka ir *apzināti pacelta*: plaukstas locītavai jābūt kadra
augšdaļā (virs `activeZoneBottom` līnijas — priekšskatījumā tā iezīmēta sarkani)
**un** pirkstiem vērstiem uz augšu (`requireUprightHand`). Citādi priekšskatījumā
rādās `roka nolaista` un skelets kļūst pelēks. Abas pārbaudes var izslēgt.

Papildus var ieslēgt **pāršķiršanu ar roku** (`swipeEnabled: true`):
kustība pa labi → `PAGES_NEXT`, pa kreisi → `PAGES_PREV`.

## Uzstādīšana

```sh
cd ~/MagicMirror/modules/MMM-GestureNav
npm install
```

`npm install` automātiski (postinstall) lejupielādē modeli
`models/hand_landmarker.task` (~7,5 MB). Ja nav interneta, palaid vēlāk:

```sh
npm run setup
# vai manuāli:
curl -L -o models/hand_landmarker.task \
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
```

### ⚠️ GPU / WebGL jābūt ieslēgtam

MagicMirror pēc noklusējuma palaiž Electron **bez GPU**
(`app.disableHardwareAcceleration()`), bet MediaPipe pieprasa WebGL kontekstu
(arī CPU inference režīmā — attēla sagatavošanai). Bez tā priekšskatījumā
rādīsies `kļūda: nav WebGL …`.

Palaid MagicMirror ar:

```sh
ELECTRON_ENABLE_GPU=1 npm start
```

vai iestati vidē pastāvīgi (piem. `~/.zshrc`, systemd `Environment=`,
autostart skriptā):

```sh
export ELECTRON_ENABLE_GPU=1
```

### Kameras atļauja

- **Electron (npm start):** MagicMirror pati atļauj kameru; macOS pirmajā reizē
  parādīs sistēmas uzvedni. Ja tā neparādās —
  *System Settings → Privacy & Security → Camera* un ieslēdz `Electron` (vai
  termināli, no kura palaiž).
- **Pārlūkā (npm run server + Chrome/Chromium):** pārlūks pieprasīs atļauju.

## Konfigurācija (`config/config.js`)

```js
{
    module: "MMM-GestureNav",
    position: "bottom_right",   // vajadzīgs tikai priekšskatījumam
    config: {
        showPreview: true,
        oneFinger: "PAGES_GOTO", oneFingerPayload: 0,  // 1 pirksts -> lapa 0
        twoFingers: "PAGES_GOTO", twoFingersPayload: 2, // 2 pirksti -> lapa 2
        openPalm: "PAGES_HOME"                          // plauksta -> sākums
    }
}
```

| Opcija | Nokl. | Nozīme |
| --- | --- | --- |
| `cameraWidth` / `cameraHeight` | `640` / `480` | pieprasītā kameras izšķirtspēja |
| `deviceId` | `null` | konkrētas kameras id (`navigator.mediaDevices.enumerateDevices()`) |
| `processingFps` | `15` | kadru analīzes biežums (mazāk = mazāk CPU; Pi 5: 10–15) |
| `analysisWidth` | `320` | uz cik px platu samazina kadru pirms analīzes |
| `numHands` | `1` | cik roku meklēt |
| `delegate` | `"CPU"` | `"CPU"` vai `"GPU"` (inference). Abiem vajag WebGL — skat. augšā. |
| `holdMs` | `500` | cik ilgi žests jātur nekustīgi, lai nostrādātu |
| `graceMs` | `250` | viens kļūdains kadrs (< šis) taimeri nenullē |
| `cooldownMs` | `1200` | pauze pēc nostrādāšanas |
| `palmMinFingers` | `4` | tik izstieptu pirkstu = "atvērta plauksta" |
| `activeZoneEnabled` | `true` | prasīt, lai plaukstas locītava ir kadra augšdaļā |
| `activeZoneTop` / `activeZoneBottom` | `0.0` / `0.6` | aktīvās zonas robežas (kadra daļa; `y=0` augša) |
| `requireUprightHand` | `true` | prasīt, lai pirksti vērsti uz augšu (roka pacelta, ne nolaista) |
| `uprightMargin` | `0.04` | cik plaukstas pamatam (9) jābūt virs locītavas (0) |
| `oneFinger` / `oneFingerPayload` | `"PAGES_GOTO"` / `0` | 1 pirksta darbība |
| `twoFingers` / `twoFingersPayload` | `"PAGES_GOTO"` / `2` | 2 pirkstu darbība |
| `threeFingers` / `threeFingersPayload` | `null` | 3 pirkstu darbība (izslēgta) |
| `openPalm` / `openPalmPayload` | `"PAGES_HOME"` / `undefined` | plaukstas darbība |
| `swipeEnabled` | `false` | vai ieslēgt pāršķiršanu ar roku |
| `swipeMinTravel` | `0.22` | cik liela daļa no kadra platuma jānoiet |
| `swipeWindowMs` | `500` | laika logs, kurā jāpaveic kustība |
| `swipeMinVelocity` | `0.6` | minimālais ātrums (platuma daļas/s) |
| `mirror` | `true` | horizontāli spoguļo (roka pa labi = swipe pa labi) |
| `onSwipeLeft` / `onSwipeRight` | `PAGES_PREV` / `PAGES_NEXT` | swipe notifikācijas |
| `showPreview` | `true` | rādīt kameras priekšskatījumu |
| `previewWidth` | `220` | priekšskatījuma platums px |
| `debug` | `false` | konsolē logo `bakets=… turēts=…ms` |

Jebkuru darbību var pārmērķēt uz citu notifikāciju/payload (piem.
`oneFinger: "MY_NOTIF"`).

## Regulēšana

Priekšskatījuma logā (apakšā pa labi) redzams uzraksts:
`nav rokas`, `1 pirksts 60%` (žests atpazīts, taimeris pildās), `✋ plauksta`,
`dūre` (0 pirkstu). Procenti sasniedz 100% → nostrādā.

- **Nereaģē / par grūti noturēt:** samazini `holdMs` (piem. `350`).
- **Nostrādā nejauši:** palielini `holdMs` vai `cooldownMs`.
- **Nolaižot rokas, nostrādā žests:** roka vēl ir aktīvajā zonā. Pacel
  `activeZoneBottom` uz augšu (piem. `0.5`) un/vai palielini `uprightMargin`.
  Priekšskatījumā turi roku virs sarkanās līnijas, pirksti uz augšu.
- **Grūti "iekļūt" zonā / jātur roka par augstu:** nolaid `activeZoneBottom`
  (piem. `0.7`), vai izslēdz `activeZoneEnabled` un paļaujies tikai uz
  `requireUprightHand`.
- **Pirksti neskaitās (rāda mazāk nekā rādi):** turi roku tuvāk, plaukstu pret
  kameru, pirkstus taisnus; ieslēdz `debug: true`.
- **Plauksta nostrādā jau pie 3 pirkstiem:** `palmMinFingers` jau ir `4`; ja par
  jutīgu — nav; ja neatpazīst plaukstu — `palmMinFingers: 3`.
- **CPU slodze (Pi 5):** `processingFps: 10`, `analysisWidth: 256`,
  `showPreview: false`.

## Pārnešana uz Raspberry Pi 5

Kods ir vienāds. Uz Pi:

```sh
cd ~/MagicMirror/modules/MMM-GestureNav && npm install
```

`node_modules/` un `models/` netiek glabāti git repozitorijā — tos atjauno
`npm install`. Ieteicams `delegate: "CPU"` un `processingFps: 10–12`.
