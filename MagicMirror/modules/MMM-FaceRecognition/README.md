# MMM-FaceRecognition

Klātbūtnes noteikšana ar tīmekļa kameru — ieslēdz ekrānu, kad kāds nostājas
spoguļa priekšā, un izslēdz to, kad neviena nav ilgāku laiku. Izmanto
[MediaPipe FaceDetector](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector)
ar modeli `blaze_face_short_range` — vieglāko no MediaPipe sejas modeļiem,
paredzēts ~2 m attālumam (tieši spoguļa lietošanas gadījumam) un ievērojami
lētāku CPU/RAM ziņā nekā pilna seju atpazīšana.

**Nosaukums var maldināt: šis NAV identitātes atpazīšana.** Modulis tikai
konstatē "ir/nav seja kadrā" — sejas netiek ne saglabātas, ne salīdzinātas
ar kādu datubāzi, un neviens attēls nekur netiek nosūtīts. Tas ir apzināta
izvēle: uz Raspberry Pi 5 ar 2 GB RAM pilna atpazīšana (piem. `dlib`/Python
risinājumi) būtu smaga un lēna, un privātuma ziņā klātbūtnes noteikšana ir
daudz drošāka — nav ko noplūst.

## Kā tas strādā

- Kamera dod kadrus ar zemu biežumu (`processingFps`, noklusējumā 2/s —
  klātbūtnei nevajag reāllaika ātrumu).
- Worker'ī (`face.worker.js`) MediaPipe pārbauda, vai kadrā ir seja.
- Sejai jābūt redzamai nepārtraukti `presentHoldMs`, lai stāvoklis kļūtu
  "klāt" (izvairās no viena kadra kļūdas).
- Ja sejas nav `absentTimeoutMs` (noklusējumā 20 s), stāvoklis kļūst "prom".
- Pie katras pārejas modulis sūta notifikāciju (pēc noklusējuma
  `REMOTE_ACTION` ar `MONITORON`/`MONITOROFF`) — **pašu ekrānu izslēdz
  MMM-Remote-Control**, ne šis modulis.
- Papildus vienmēr tiek raidītas `FACE_PRESENT` / `FACE_ABSENT` (bez payload),
  lai citi moduļi var reaģēt uz klātbūtni (piem. MMM-Routines jautā par treniņu).

## Uzstādīšana

```sh
cd ~/MagicMirror/modules/MMM-FaceRecognition
npm install
```

`npm install` automātiski (postinstall) lejupielādē modeli
`models/blaze_face_short_range.tflite` (< 1 MB). Ja nav interneta, palaid vēlāk:

```sh
npm run setup
# vai manuāli:
curl -L -o models/blaze_face_short_range.tflite \
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
```

### ⚠️ GPU / WebGL jābūt ieslēgtam

Tāpat kā MMM-GestureNav, arī šim modulim vajag WebGL kontekstu (arī CPU
inference režīmā):

```sh
ELECTRON_ENABLE_GPU=1 npm start
```

### MMM-Remote-Control jābūt konfigurētam

Ekrāna ieslēgšanu/izslēgšanu faktiski izpilda `MMM-Remote-Control`
(`lib/systemControl.js`, pēc noklusējuma caur `wlopm`). Pārliecinies, ka tas
ir modulī sarakstā (config.js) un ka `wlopm` (vai konfigurēta alternatīva —
skat. MMM-Remote-Control `docs/guide/monitor-control.md`) darbojas uz Pi.
Bez tā modulis nosūtīs `REMOTE_ACTION` notifikāciju, bet nekas nenotiks.

### Kameras atļauja

Tā pati kā MMM-GestureNav — Electron pieprasīs kameras atļauju pirmajā
palaišanas reizē (macOS: *System Settings → Privacy & Security → Camera*).

## Konfigurācija (`config/config.js`)

```js
{
    module: "MMM-FaceRecognition",
    config: {
        absentTimeoutMs: 30000 // 30 s bez sejas, tad ekrāns izslēdzas
    }
}
```

| Opcija | Nokl. | Nozīme |
| --- | --- | --- |
| `cameraWidth` / `cameraHeight` | `320` / `240` | pieprasītā kameras izšķirtspēja (zemāka nekā GestureNav — klātbūtnei nevajag daudz) |
| `deviceLabel` | `null` | daļa no kameras nosaukuma (reģistrnejutīgi), piem. `"C270"` — **ieteicamais veids**, jo der gan uz Mac, gan uz Pi. Ja tāda nav, izmanto noklusējuma kameru (un brīdina konsolē ar pieejamo kameru sarakstu) |
| `deviceId` | `null` | konkrētas kameras id (`navigator.mediaDevices.enumerateDevices()`); ir citāds katrā ierīcē/profilā un pārspēj `deviceLabel` |
| `processingFps` | `2` | kadru analīzes biežums (klātbūtnei pietiek ar zemu — taupa CPU/RAM uz Pi 5) |
| `analysisWidth` | `192` | uz cik px platu samazina kadru pirms analīzes |
| `delegate` | `"CPU"` | `"CPU"` vai `"GPU"` (inference). Abiem vajag WebGL. |
| `minDetectionConfidence` | `0.5` | minimālā pārliecība, lai atzītu "seja kadrā" |
| `presentHoldMs` | `800` | cik ilgi seja jāredz nepārtraukti, lai kļūtu "klāt" |
| `absentTimeoutMs` | `20000` | cik ilgi bez sejas, lai kļūtu "prom" (ekrāns izslēdzas) |
| `cooldownMs` | `5000` | minimālais starplaiks starp diviem MONITORON/OFF sūtījumiem |
| `onPresent` / `onPresentPayload` | `"REMOTE_ACTION"` / `{action:"MONITORON"}` | notifikācija, kad kāds pienāk klāt |
| `onAbsent` / `onAbsentPayload` | `"REMOTE_ACTION"` / `{action:"MONITOROFF"}` | notifikācija, kad neviena nav |
| `showPreview` | `false` | rādīt kameras priekšskatījumu (atkļūdošanai) |
| `previewWidth` | `200` | priekšskatījuma platums px |
| `mirror` | `true` | priekšskatījumu horizontāli spoguļo |
| `debug` | `false` | konsolē logo katru pāreju |

## Regulēšana

- **Ekrāns izslēdzas par ātru, kad tikai īsi paskaties uz sāniem:**
  palielini `absentTimeoutMs` (piem. `45000`).
- **Ekrāns neieslēdzas uzreiz, pienākot klāt:** samazini `presentHoldMs`,
  bet uzmanies — pārāk zems var nostrādāt uz nejaušām ēnām/kustību.
- **Mirgo (ieslēdzas/izslēdzas ātri pēc kārtas):** palielini `cooldownMs`
  un/vai `absentTimeoutMs`.
- **CPU slodze (Pi 5, 2 GB):** `processingFps: 1`, `analysisWidth: 160`.
- **Nekas nenotiek, kaut modulis rāda pāreju:** pārbaudi, vai
  MMM-Remote-Control ir sarakstā un vai `wlopm` (vai konfigurēta
  alternatīva) strādā uz Pi manuāli no termināļa.

## Pārnešana uz Raspberry Pi 5

Kods ir vienāds. Uz Pi:

```sh
cd ~/MagicMirror/modules/MMM-FaceRecognition && npm install
```

`node_modules/` un `models/` netiek glabāti git repozitorijā — tos atjauno
`npm install`.
