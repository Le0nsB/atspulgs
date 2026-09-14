# MMM-SpotifyNowPlaying

Rāda, kāda Spotify dziesma pašlaik skan tavā kontā (nosaukums, izpildītājs,
albuma vāciņš un atskaņošanas josla).

Nav vajadzīgas ārējās npm bibliotēkas — izmanto Node iebūvēto `fetch`.
Vajag tikai Spotify Web API akreditācijas datus.

## 1. Izveido Spotify lietotni

1. Ej uz https://developer.spotify.com/dashboard un izveido jaunu lietotni.
2. Lietotnes iestatījumos pie **Redirect URIs** pievieno tieši:
   `http://127.0.0.1:8888/callback`
3. Pieraksti **Client ID** un **Client Secret**.

## 2. Iegūsti refresh token (vienreiz)

Moduļa mapē palaid:

```bash
cd modules/MMM-SpotifyNowPlaying
SPOTIFY_CLIENT_ID=tavs_id SPOTIFY_CLIENT_SECRET=tavs_secret npm run get-token
```

Atvērsies pārlūks, autorizē piekļuvi, un terminālī tiks izdrukāts
**refresh token**. Tas nemainās — saglabā to.

## 3. Ieraksti atslēgas config/secrets.js

Atslēgas glabājas atsevišķi, lai tās nenokļūtu git repozitorijā:

```bash
cp config/secrets.js.sample config/secrets.js
```

Aizpildi `config/secrets.js`:

```js
module.exports = {
    spotify: {
        clientId: "tavs_id",
        clientSecret: "tavs_secret",
        refreshToken: "tavs_refresh_token"
    }
};
```

`config.js` jau automātiski nolasa šīs vērtības (`secrets.spotify.*`).
`config/secrets.js` ir izslēgts no git, tāpēc atslēgas paliek tikai uz tavas iekārtas.

## Konfigurācijas opcijas

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `clientId` | `""` | Spotify lietotnes Client ID |
| `clientSecret` | `""` | Spotify lietotnes Client Secret |
| `refreshToken` | `""` | Ar `get-token` iegūtais refresh token |
| `updateInterval` | `15000` | Cik bieži (ms) vaicāt Spotify (min. 5000) |
| `showAlbumArt` | `true` | Rādīt albuma vāciņu |
| `showProgress` | `true` | Rādīt atskaņošanas joslu un laiku |
| `hideWhenNothingPlaying` | `true` | Paslēpt moduli, kad nekas neskan |
| `className` | `"small"` | MagicMirror teksta klases |
| `playNotification` | `"SPOTIFY_PLAY"` | Notifikācija, kas atsāk atskaņošanu |
| `pauseNotification` | `"SPOTIFY_PAUSE"` | Notifikācija, kas aptur atskaņošanu |
| `toggleNotification` | `"SPOTIFY_TOGGLE"` | Notifikācija, kas pārslēdz play/pause |
| `nextNotification` | `"SPOTIFY_NEXT"` | Notifikācija — nākamā dziesma |
| `prevNotification` | `"SPOTIFY_PREV"` | Notifikācija — iepriekšējā dziesma |
| `volumeUpNotification` | `"SPOTIFY_VOLUME_UP"` | Notifikācija — skaļāk |
| `volumeDownNotification` | `"SPOTIFY_VOLUME_DOWN"` | Notifikācija — klusāk |
| `volumeStep` | `10` | Procentpunkti vienai skaļāk/klusāk reizei |

## Atskaņošanas vadība (play/pause/next/prev/skaļums)

Modulis klausās parastas MagicMirror notifikācijas (nosaukumus var mainīt
config'ā, skat. tabulu augstāk) un pārsūta tās uz Spotify Web API caur
`node_helper`. Tāpēc to var vadīt no **jebkura** cita moduļa vai avota, kas
sūta šīs notifikācijas — piem.:

- **MMM-VoiceCommands** — noklusējumā jau ietver frāzes "pauze", "atskaņo
  mūziku", "nākamā dziesma", "skaļāk" u.c. (skat. tā moduļa README.md).
- **MMM-Remote-Control** — jebkuru no šīm notifikācijām var nosūtīt caur
  vispārīgo "sūtīt notifikāciju" izvēlni vai REST API
  (`/api/notification/SPOTIFY_NEXT`), bez papildu konfigurācijas.
- **MMM-GestureNav** — piesaistot kādam žestam, piem. `config.js`:
  `fist: "SPOTIFY_TOGGLE"`.

### Priekšnosacījumi

- **Spotify Premium konts.** Bez Premium atskaņošanas vadības galapunkti
  (play/pause/next/previous/volume) atgriež 403 kļūdu — modulis to uz brīdi
  parāda ekrānā ("Atskaņošanas vadība prasa Spotify Premium.").
- **Aktīva ierīce** — Spotify jābūt vaļā (vismaz pauzētā stāvoklī) kādā
  ierīcē. Ja nav nevienas, redzēsi "Nav aktīvas Spotify ierīces…".
- **Papildu tiesību apjoms (scope) tokenam.** Refresh token, ko iegūsti ar
  `npm run get-token`, ir "ieslēgts" tikai tām tiesībām, kas bija pieprasītas
  tā ģenerēšanas brīdī. Ja tavs `refreshToken` config'ā tapis PIRMS šīs
  funkcijas, vadības izsaukumi atgriezīsies ar 401/403 — **ģenerē to no
  jauna**:
  ```bash
  cd modules/MMM-SpotifyNowPlaying
  SPOTIFY_CLIENT_ID=tavs_id SPOTIFY_CLIENT_SECRET=tavs_secret npm run get-token
  ```
  un ieliec jauno `refreshToken` `config/secrets.js`.

## Piezīmes

- Spotify rāda pašlaik atskaņoto tikai tad, kad kāda ierīce aktīvi atskaņo
  (dators, telefons, kolonna u.tml.).
- `client_secret` glabājas `config.js` — turi to privātu.
