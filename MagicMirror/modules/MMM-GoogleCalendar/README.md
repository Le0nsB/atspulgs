# MMM-GoogleCalendar

Rāda tuvākos notikumus no personīgā Google Calendar. Pieslēgšana notiek ar
OAuth 2.0 **device authorization** plūsmu — tā pati, ko izmanto,
piemēram, YouTube uz TV: spogulis parāda kodu un adresi
(`google.com/device`), lietotājs to ievada SAVĀ tālrunī vai datorā, un
piekļuve tiek piešķirta automātiski. Nav jāzin, kas ir `secrets.js`, iCal
adrese vai konfigurācijas faili — tikai kods jāieraksta pārlūkā.

Notikumi papildus tiek pārraidīti kā `CALENDAR_EVENTS`, tāpēc tie
automātiski parādās arī **MMM-MonthCalendar** mēneša skatā zem attiecīgā
datuma — nekas tur nav jākonfigurē.

## Vienreizēja uzstādīšana (administratoram)

Device flow tik un tā vajag OAuth klientu — to Google neizsniedz "uz
vietas", tas jāizveido vienreiz [Google Cloud Console](https://console.cloud.google.com/):

1. Izveido jaunu projektu (vai izmanto esošu).
2. **APIs & Services → Library** → atrodi un ieslēdz **Google Calendar API**.
3. Kreisajā izvēlnē **Google Auth Platform** sadaļa (jaunajā konsoles
   izkārtojumā tas ir sadalīts vairākās lapās, nevis viena "OAuth consent
   screen"):
	- **Branding**: aizpildi app nosaukumu un atbalsta e-pastu (bez tā
	  pārējās lapas nestrādās).
	- **Audience**: User type **External**, publishing status paliek
	  **Testing** (nav jāiesniedz Google pārbaudei — pietiek
	  personiskai/ģimenes lietošanai). Zemāk **Test users** → **+ Add
	  users** → pievieno KATRA cilvēka Google e-pastu, kuram atļausi
	  pieslēgt savu kalendāru (testēšanas režīmā drīkst līdz 100). Ja
	  vēlāk gribi kādu jaunu pievienot — atgriezies šeit.
	- **Data Access** → **Add or remove scopes** → ielīmē manuālajā laukā
	  `https://www.googleapis.com/auth/calendar.readonly` → **Update** →
	  **Save**.
4. **Clients** (tajā pašā kreisajā izvēlnē) → **Create client**:
	- Application type: **TV and Limited Input devices**.
	- Nokopē **Client ID** un **Client secret**.
5. Ieraksti tos `MagicMirror/secrets.js` (nevis `config/secrets.js`):

```js
module.exports = {
	// ...
	google: {
		oauthClientId: "TAVS_CLIENT_ID",
		oauthClientSecret: "TAVS_CLIENT_SECRET"
	}
};
```

6. Restartē MagicMirror.

## Pieslēgšana (jebkuram cilvēkam)

Kad OAuth klients ir uzstādīts, katrs cilvēks (kura e-pasts ir pievienots
test users sarakstā solī 3) var pats pieslēgt SAVU kalendāru:

1. Uz spoguļa ekrāna parādās: *"Pieslēdz Google kalendāru"* + adrese
   (`google.com/device`) + kods.
2. Atver šo adresi tālrunī vai datorā, pierakstās ar savu Google kontu un
   ievada kodu.
3. Apstiprini piekļuvi ("Allow"/"Atļaut") — spogulis dažu sekunžu laikā
   automātiski pāriet uz notikumu sarakstu.

Ja kods paliek neizmantots (parasti ~30 min), spogulis pats izveido jaunu
— nekas nav jārestartē.

## Konfigurācija

```js
{
	module: "MMM-GoogleCalendar",
	header: "Mans kalendārs",
	position: "top_left",
	config: {}
}
```

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `updateInterval` | `900000` (15 min) | Cik bieži (ms) vaicāt Google (min. 5 min) |
| `maximumNumberOfDays` | `60` | Cik tālu uz priekšu ielādēt notikumus (der arī MMM-MonthCalendar mēneša skatam) |
| `maxUpcoming` | `5` | Cik notikumus rādīt paša moduļa sarakstā |

## Kāpēc ne vienkārši "Sign in with Google" poga?

Parastajai OAuth pogai vajag publisku HTTPS callback adresi (piem.
`https://tavadomena.lv/oauth/callback`), ko spogulis mājas tīklā bez
domēna nevar piedāvāt. Device flow šo problēmu apiet — nekāda callback
servera nav vajadzīgs, autorizācija notiek pilnībā lietotāja pusē.

## Piezīmes

- Pieslēguma dati (`refresh token`) tiek glabāti `token.json` šī moduļa
  mapē (`.gitignore`-ots — nekad nenonāk Git). Ja gribi atslēgt kādu
  kontu, izdzēs šo failu un restartē MagicMirror — parādīsies jauns
  pieslēgšanās kods.
- Ja lietotājs kontā atsauc piekļuvi ("Manage third-party access" Google
  kontā), spogulis to pamana nākamajā vaicājumā un automātiski parāda
  jaunu pieslēgšanās kodu.
- Notikumu izvēršanu (arī atkārtotus, piem. "katru pirmdienu") veic pati
  Google Calendar API (`singleEvents=true`) — modulim tas nav jādara pašam.
