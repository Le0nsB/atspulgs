# MMM-SpotifyDetail

Pilna Spotify lapa: pašreizējā dziesma uz griežas vinila diska (albuma
vāciņš diska centrā), rindā nākošās dziesmas un dziesmas vārdi, kas
sinhroni izceļas atskaņošanas laikā ("live lyrics").

Izmanto tos pašus akreditācijas datus kā **MMM-SpotifyNowPlaying** — skat.
tā README.md par `clientId`/`clientSecret`/`refreshToken` iegūšanu
(`MagicMirror/secrets.js`; modulim `config` tie NAV jānorāda). Šis modulis ir neatkarīgs (savs `node_helper`, savs
Spotify vaicājumu cikls), tāpēc to var pievienot/noņemt bez ietekmes uz
mazo "now playing" widget'u.

Dziesmas vārdus iegūst no [LRCLIB](https://lrclib.net) — brīvi pieejams
API bez atslēgas, kas atgriež laikā sinhronizētus (LRC) vārdus, ja tādi
pieejami. Ja LRCLIB konkrētai dziesmai vārdu nezina, rādīts "Vārdi nav
atrasti".

## Konfigurācija

```js
{
	module: "MMM-SpotifyDetail",
	position: "middle_center",
	config: {}
}
```

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `updateInterval` | `15000` | Cik bieži (ms) vaicāt Spotify (min. 5000) |
| `queueLimit` | `5` | Cik nākamās dziesmas rādīt |
| `showLyrics` | `true` | Rādīt dziesmas vārdus |
| `lyricsContextLines` | `2` | (rezervēts) — cik rindas rādīt ap pašreizējo |

## Lapu pārslēdzējs (MMM-Pages)

Šis modulis domāts kā sava lapa `MMM-Pages` konfigurācijā:

```js
{
	module: "MMM-Pages",
	config: {
		pages: [
			// ...
			["MMM-SpotifyDetail"]
		]
	}
}
```

Uz to var pāriet ar kreiso/labo bulttaustiņu (lapas rotē secīgi) vai
piešķirot tai `PAGES_GOTO` notifikāciju kādam žestam/balss komandai,
piem. `MMM-GestureNav` config'ā.

## Piezīmes

- Rinda (`queue`) nāk no Spotify `/me/player/queue` galapunkta — tas
  strādā tikai tad, ja kaut kas šobrīd skan vai ir nesen skanējis kādā
  aktīvā ierīcē.
- Vinila disks griežas tikai tad, kad dziesma tiešām atskaņojas
  (`isPlaying`), tāpat kā īsts diskspēlētājs.
