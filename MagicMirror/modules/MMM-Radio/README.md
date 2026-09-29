# MMM-Radio

Interneta radio spogulī — ieslēdz ar balsi vai žestu, spogulis rāda
staciju un (ja stacija to sūta) pašlaik skanošo dziesmu un izpildītāju.

Skaņa nāk no spoguļa paša (Pi → HDMI/TV skaļruņi vai 3,5 mm izeja).
Atskaņo tikai Electron logs, nevis MacBook/telefons, kas atvēris to pašu
MagicMirror lapu (`playOn: "electron"`).

## Konfigurācija

```js
{
	module: "MMM-Radio",
	position: "bottom_left",
	config: {}
}
```

Ieteicams pievienot MMM-Pages `fixed` sarakstam — tad skanošais radio
redzams jebkurā lapā. Kad radio neskan, modulis neko nerāda.

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `stations` | 6 Latvijas stacijas | `[{ name, url, aliases?, logo? }]` — tiešās MP3/AAC straumes (ne `.m3u8`) |
| `playOn` | `"electron"` | `"all"` — atskaņot katrā klientā |
| `volume` | `0.8` | Sākuma skaļums (0..1) |
| `volumeStep` | `0.1` | Solis "skaļāk"/"klusāk" |
| `pauseSpotify` | `true` | Radio ieslēdzot, apturēt Spotify, ja tas skan |
| `showTrack` | `true` | Rādīt dziesmu no straumes ICY metadatiem |
| `metadataInterval` | `30000` | Cik bieži (ms) atjaunot dziesmas nosaukumu |

`aliases` — citi nosaukumi, kā staciju var nosaukt balsī ("swh", "es ve ha").
Stacijas URL var atrast [radio-browser.info](https://www.radio-browser.info)
(lauks *url_resolved*). Latvijas Radio 1–5 publiski ir tikai HLS formātā,
ko Electron `<audio>` neatskaņo, tāpēc tie nav sarakstā.

## Vadība

| Balss ("Spoguli, …") | Žests | Notifikācija |
|---|---|---|
| "ieslēdz radio" | 3 pirksti (ieslēdz/izslēdz) | `RADIO_PLAY` / `RADIO_TOGGLE` |
| "izslēdz radio", "apturi mūziku" | 3 pirksti | `RADIO_STOP` |
| "nākamā stacija" / "iepriekšējā stacija" | — | `RADIO_NEXT` / `RADIO_PREV` |
| "ieslēdz staciju star fm" | — | `RADIO_PLAY_NAMED { text }` |
| "skaļāk" / "klusāk" | — | `SPOTIFY_VOLUME_UP/DOWN` (kad skan radio — radio skaļums) |

Pēdējā izvēlētā stacija tiek atcerēta (`MagicMirror/data/radio.json`).

## Kā tas strādā

- `node_helper.js` ir vienīgais stāvokļa avots (stacija, skan/neskan) —
  balss komanda nonāk pie vairākiem klientiem, bet izpildās vienreiz.
- Dziesmas nosaukums: Icecast/SHOUTcast straumes ik pēc `icy-metaint`
  baitiem iesūta `StreamTitle='Izpildītājs - Dziesma'`. Serveris ik pēc
  `metadataInterval` īsi pieslēdzas straumei, nolasa vienu bloku un
  atvienojas (~16 KB, nevis otra pilna straume).
- Ja straume nav pieejama, radio izslēdzas un īsi parāda paziņojumu.
