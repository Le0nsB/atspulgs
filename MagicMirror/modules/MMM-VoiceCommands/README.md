# MMM-VoiceCommands

Balss komandas latviešu valodā ar **aktivācijas vārdu** (kā Google / Siri), lai
modulis nenostrādā nejauši. Piemēram: pasaki **„Spoguli”**, ekrāna malas
iemirdzas un modulis ~8 sekundes gaida komandu, piem. **„parādi laikapstākļus”**.
Var arī vienā elpas vilcienā: **„Spoguli, parādi laikapstākļus”**.

Komandas tiek pārraidītas kā MagicMirror notifikācijas, tāpēc strādā kopā ar
`MMM-Pages` (`PAGES_GOTO`, `PAGES_HOME`, …), `MMM-NewsDetail` u.c.

## Kā notiek atpazīšana

Izmanto pārlūka **Web Speech API** (`webkitSpeechRecognition`). To atbalsta tikai
daži pārlūki (droši — **Google Chrome**). MagicMirror noklusējuma **Electron**
klients to **neatbalsta**, un arī Raspberry Pi Chromium parasti nē.

Tāpēc modulis strādā **divos režīmos (lomās)**:

| Loma         | Ko dara                                                        | Kur |
| ------------ | ------------------------------------------------------------- | --- |
| **listener** | Klausās mikrofonā, atpazīst runu, sūta komandu serverim       | Ierīce ar Chrome + mikrofonu (piem. MacBook) |
| **display**  | Neklausās; saņem komandu un izpilda + rāda malu mirdzumu      | Pi TV displejs (Electron) |

`node_helper` uz Pi darbojas kā **relejs**: komanda, ko dzirdēja *listener*, tiek
pārraidīta **visiem** pieslēgtajiem klientiem, tāpēc TV displejs pārslēdz lapu.

Loma tiek noteikta **automātiski** (`listen: "auto"` — ja pārlūkam ir Web Speech
API → *listener*, citādi → *display*). Var piespiest ar `listen: true/false` vai
ar URL: `?voice=listen`, `?voice=display`, `?voice=off`.

> **Kad Pi būs savs USB mikrofons** — tad viss var notikt uz Pi bez otras ierīces.
> Šim `node_helper` jau ir sagatavota vieta lokālai atpazīšanai (whisper.cpp).

## Uzstādīšana (MacBook = mikrofons, Pi = displejs)

### 1. Pi pusē — `config/config.js`

```js
address: "0.0.0.0",   // pieejams no MacBook tajā pašā tīklā
ipWhitelist: [],       // vai ieraksti tikai MacBook IP drošībai
```

Modulis (jau pievienots):

```js
{
    module: "MMM-VoiceCommands",
    position: "top_center",
    config: { /* noklusējumi der; listen: "auto" */ }
},
```

Un `MMM-Pages` `fixed` sarakstā, lai klausās/rāda visās lapās:

```js
fixed: ["clock", "alert", "updatenotification", "MMM-GestureNav", "MMM-VoiceCommands"],
```

Pēc `node_helper.js` pievienošanas **jārestartē MagicMirror** (ne tikai jāpārlādē
lapa).

Uzzini Pi IP: `hostname -I`.

### 2. MacBook pusē

Atver **Google Chrome**:

```
http://<pi-ip>:8080/?voice=listen
```

Pirmajā reizē atļauj mikrofonu. Šo cilni atstāj atvērtu — kamēr tā ir atvērta
(un dators tīklā + internets), balss komandas strādā. Ekrāns var būt aizslēgts,
cilne var būt fonā.

### 3. Pārbaude

- Pasaki **„Spoguli”** → gan MacBook, gan TV ekrāna malām jāiemirdzas zilām.
- Pasaki **„parādi kalendāru”** → TV pārslēdzas uz kalendāra lapu, malas iemirdzas zaļas.

## Konfigurācija

| Opcija                 | Noklusējums                              | Apraksts |
| ---------------------- | ---------------------------------------- | -------- |
| `listen`               | `"auto"`                                 | `"auto"` / `true` / `false` — vai šis klients klausās. URL `?voice=` pārspēj |
| `lang`                 | `"lv-LV"`                                | Atpazīšanas valoda |
| `activation`           | `["spoguli", "spogulīt", "spogulīti"]`   | Aktivācijas vārds(-i). Teksts vai masīvs |
| `activationTimeout`    | `8000`                                   | Cik ilgi (ms) pēc aktivācijas gaidīt komandu |
| `sameUtteranceCommand` | `true`                                   | Atļaut „Spoguli, parādi laikapstākļus” vienā teikumā |
| `fuzzy`                | `true`                                   | Pieļaut nelielas atpazīšanas kļūdas |
| `fuzzyMaxDistance`     | `2`                                      | Maks. burtu atšķirība „fuzzy” salīdzināšanā |
| `glow`                 | `true`                                   | Ekrāna malu mirdzums |
| `glowListenColor`      | `rgba(120,180,255,0.55)`                 | Krāsa, kamēr klausās |
| `glowConfirmColor`     | `rgba(120,255,150,0.55)`                 | Krāsa, kad komanda atpazīta |
| `glowErrorColor`       | `rgba(255,120,120,0.5)`                  | Krāsa, kad komanda nav sadzirdēta |
| `glowEdges`            | `["left","right","top","bottom"]`        | Kuras malas mirdz |
| `showStatus`           | `true`                                   | Rādīt mazu statusa rindiņu modulī |
| `idleText`             | `""`                                     | Teksts dīkstāvē (`""` = nerādīt) |
| `autoStart`            | `true`                                   | *listener* sāk klausīties uzreiz |
| `startDelay`           | `1500`                                   | ms pirms pirmās klausīšanās |
| `restartDelay`         | `400`                                    | ms starp atpazīšanas sesijām |
| `debug`               | `false`                                  | Rādīt lomu + transkriptu + vairāk logu |
| `commands`             | *(skat. zemāk)*                          | Frāze → notifikācija |

### Noklusējuma komandas

| Saki (pēc „Spoguli”)                          | Darbība                     |
| -------------------------------------------- | -------------------------- |
| parādi laikapstākļus / laikapstākļi / laiks | `PAGES_GOTO` 0             |
| parādi kalendāru / kalendārs                | `PAGES_GOTO` 2             |
| parādi ziņas / ziņas                        | `PAGES_GOTO` 3             |
| nākamā ziņa / cita ziņa                     | `NEWSDETAIL_NEXT`         |
| uz sākumu / sākums / mājas                  | `PAGES_HOME`              |
| nākamā lapa / uz priekšu                    | `PAGES_NEXT`             |
| iepriekšējā lapa / atpakaļ                  | `PAGES_PREV`            |

### Savas komandas

```js
commands: [
    { phrases: ["ieslēdz gaismu", "gaisma"], notification: "MY_LIGHT_ON" },
    { phrases: ["parādi laikapstākļus", "laiks"], notification: "PAGES_GOTO", payload: 0, label: "Laikapstākļi" }
]
```

`phrases` — jebkurš sakritums der. Salīdzināšana ir reģistrnejutīga un
neatkarīga no garumzīmēm/mīkstinājumiem (`ā`≈`a`, `š`≈`s`).

## Notifikācijas

Modulis **klausās** (parasta MM notifikācija):

| Notifikācija          | Payload  | Darbība |
| --------------------- | -------- | ------- |
| `VOICE_LISTEN_START`  | –        | Padara šo klientu par *listener* un ieslēdz mikrofonu |
| `VOICE_LISTEN_STOP`   | –        | Izslēdz mikrofonu |
| `VOICE_ACTIVATE_NOW`  | –        | Aktivizē (kā aktivācijas vārds) |
| `VOICE_SIMULATE`      | `string` | Apstrādā tekstu, it kā tas būtu dzirdēts (testam bez mikrofona) |

Modulis **sūta** (parasta MM notifikācija, katrā klientā):

| Notifikācija        | Payload |
| ------------------- | ------- |
| `VOICE_ACTIVATED`   | – |
| `VOICE_DEACTIVATED` | – |
| `VOICE_COMMAND`     | `{ notification, payload, text }` |

Iekšēji starp klientiem un `node_helper` iet `VC_ACTIVATED` / `VC_DEACTIVATED` /
`VC_COMMAND` (socket notifikācijas).

## Testēšana bez mikrofona

Jebkura klienta (arī Pi) dev konsolē:

```js
MM.getModules().find(m => m.name === "MMM-VoiceCommands")
    .sendNotification("VOICE_SIMULATE", "spoguli parādi kalendāru");
```

Ja atpazīšana strādā, bet komanda neizpildās uz TV — pārbaudi, vai MagicMirror
tika **restartēts** pēc `node_helper.js` pievienošanas, un vai abas ierīces ir
vienā tīklā.
