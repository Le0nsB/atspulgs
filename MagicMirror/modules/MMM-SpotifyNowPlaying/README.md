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

## Piezīmes

- Spotify rāda pašlaik atskaņoto tikai tad, kad kāda ierīce aktīvi atskaņo
  (dators, telefons, kolonna u.tml.).
- `client_secret` glabājas `config.js` — turi to privātu.
