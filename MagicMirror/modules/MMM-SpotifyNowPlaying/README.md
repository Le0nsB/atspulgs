# MMM-SpotifyNowPlaying

Rāda, kāda Spotify dziesma pašlaik skan tavā kontā (nosaukums, izpildītājs,
albuma vāciņš un atskaņošanas josla).

Nav vajadzīgas ārējās npm bibliotēkas — izmanto Node iebūvēto `fetch`.
Vajag tikai Spotify Web API akreditācijas datus.

## Pieslēgšana (no telefona)

Tālvadībā (`http://<pi-ip>:8080/remote.html`) spied **Spotify** — vai noskenē
QR kodu spoguļa Spotify lapā, kamēr Spotify vēl nav pieslēgts. Lapa
`/spotify` ved cauri diviem soļiem:

1. **Spotify lietotne (vienreiz).** Lapa parāda, kas jāizdara
   [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   (Create app → Redirect URI ar pogu "Kopēt" → Web API → Settings), un tur
   ielīmē **Client ID** un **Client Secret**. Spogulis tos uzreiz pārbauda
   pie Spotify.
2. **Pieslēgt Spotify** → Spotify pieteikšanās → "Agree" → atpakaļ spogulī.

Pēc dažām sekundēm abi Spotify moduļi sāk rādīt, kas skan — bez restarta.
Kontu var nomainīt vai atslēgt tajā pašā lapā.

Atslēgas glabājas `MagicMirror/data/spotify.json` (tikai īpašniekam lasāms,
nav git). Vecais veids — `secrets.js` `spotify: { clientId, clientSecret,
refreshToken }` un `npm run get-token` — joprojām strādā, bet lapā pieslēgtais
konts ir noteicošais.

### Kāpēc starplapa (GitHub Pages)

Kopš 2025. gada Spotify atļauj Redirect URI tikai ar **HTTPS** (vai
`http://127.0.0.1`), bet spogulis mājas tīklā ir `http://192.168.x.x:8080`.
Tāpēc Spotify pēc pieteikšanās sūta uz statisku HTTPS lapu
`https://le0nsb.github.io/atspulgs/spotify-callback.html` (repozitorija
`docs/spotify-callback.html`), kas uzreiz pāradresē uz spoguli, no kura
pieslēgšanās sākta. Tā pati neko neglabā, pāradresē tikai uz mājas tīkla
adresēm, un kodu bez Client Secret (tas ir tikai spogulī) izmantot nevar.

Vienreiz jāieslēdz GitHub Pages: repozitorijā **Settings → Pages → Build and
deployment → Deploy from a branch → `main` / `/docs` → Save**.

### Ja Spotify saka, ka nav piekļuves

Spotify lietotne "Development mode" režīmā ļauj pieteikties tikai tās
izveidotājam un kontiem, kas pievienoti **Dashboard → lietotne → User
Management**. Ja pieslēdz cita cilvēka kontu, pievieno tur viņa Spotify
e-pastu.

## Konfigurācijas opcijas

| Opcija | Noklusējums | Apraksts |
|---|---|---|
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
- **Tiesību apjoms (scope).** Ja vadība atgriež 401/403 ar vecu
  `secrets.js` tokenu, vienkārši pieslēdz kontu no jauna lapā `/spotify`.

## Piezīmes

- Spotify rāda pašlaik atskaņoto tikai tad, kad kāda ierīce aktīvi atskaņo
  (dators, telefons, kolonna u.tml.).
- Client Secret glabājas tikai spoguļa serverī (`data/spotify.json` vai
  `secrets.js`) — tas netiek sūtīts pārlūkam vai telefona lapai.
