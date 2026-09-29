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
	- **Audience**: User type **External**, tad **Publish app** →
	  publishing status **In production**. Svarīgi: režīmā **Testing**
	  Google pieslēgumu (refresh token) atsauc pēc **7 dienām**, un
	  spogulim katru nedēļu būtu jāpieslēdzas no jauna. Google pārbaudei
	  app NAV jāiesniedz — nepārbaudītai app pieslēdzoties parādās
	  brīdinājums "Google hasn't verified this app" → **Advanced** →
	  **Go to … (unsafe)** → turpini. Nepārbaudīta app drīkst līdz 100
	  lietotājiem, ar to pietiek ģimenei.
	- **Data Access** → **Add or remove scopes** → ielīmē manuālajā laukā
	  `https://www.googleapis.com/auth/calendar` → **Update** → **Save**.
	  (Pilnā atļauja, jo "TV" pieslēgšanās plūsma neatļauj šaurāko
	  `calendar.events`, bet notikumu pievienošanai vajag rakstīt.)
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

Kad OAuth klients ir uzstādīts, katrs cilvēks var pats pieslēgt SAVU
kalendāru:

1. Uz spoguļa ekrāna parādās: *"Pieslēdz Google kalendāru"* + adrese
   (`google.com/device`) + kods.
2. Atver šo adresi tālrunī vai datorā, pierakstās ar savu Google kontu un
   ievada kodu.
3. Apstiprini piekļuvi ("Allow"/"Atļaut") — spogulis dažu sekunžu laikā
   automātiski pāriet uz notikumu sarakstu.

Ja kods paliek neizmantots (parasti ~30 min), spogulis pats izveido jaunu
— nekas nav jārestartē.

## Notikumu pievienošana no telefona

Telefonā atver `http://<spoguļa-ip>:8080/calendar`: noskenē QR kodu
MMM-CalendarAgenda lapā ("Plānotais") vai tālvadībā nospied **Kalendārs**.
Tur var:

- pievienot notikumu (nosaukums, "Šodien / Rīt / Parīt" vai datums,
  laiks vai "Visu dienu"; bez beigu laika notikums ilgst stundu). Spogulī
  tas parādās uzreiz;
- redzēt tuvākos notikumus;
- izdzēst notikumus, kas pievienoti no šīs lapas. Pārējos var dzēst tikai
  Google kalendārā, jo lapai nav paroles (to sargā tikai `ipWhitelist`).

Notikumi, kas pievienoti Google kalendāra lietotnē, spogulī parādās minūtes
laikā, tāpēc cilvēkiem ar pieslēgto kontu var izmantot arī to.

Ja kalendārs pieslēgts pirms šīs funkcijas (tikai lasīšanas atļauja), lapa
piedāvā pogu **Atjaunot Google atļauju**. Pēc tās jāievada jauns kods, un
lapa to parāda tepat telefonā.

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
| `updateInterval` | `60000` (1 min) | Cik bieži (ms) vaicāt Google (min. 1 min). Ekrāns tiek pārzīmēts tikai, ja notikumi mainījušies |
| `maximumNumberOfDays` | `60` | Cik tālu uz priekšu ielādēt notikumus (der arī MMM-MonthCalendar mēneša skatam) |
| `maxUpcoming` | `5` | Cik notikumus rādīt paša moduļa sarakstā |
| `icsUpdateInterval` | `300000` (5 min) | Cik bieži vaicāt Outlook/ICS kalendārus |
| `reminderMinutes` | `[15]` | Atgādināt tik minūtes pirms notikuma (var vairākus: `[60, 10]`; `[]` = izslēgts) |
| `allDayReminderTime` | `"08:00"` | Visas dienas notikumu atgādinājums tās dienas rītā (`""` = neatgādināt) |
| `reminderDuration` | `20000` | Cik ilgi (ms) atgādinājums redzams |

## Outlook / Microsoft 365 (un citi ICS kalendāri)

Outlook kalendāru spogulis lasa caur publicētu ICS saiti — bez atsevišķas
Microsoft pieslēgšanās:

1. [outlook.live.com](https://outlook.live.com) (vai Outlook darbā) →
   ⚙ Iestatījumi → **Kalendārs** → **Koplietotie kalendāri** →
   **Publicēt kalendāru** → izvēlies kalendāru un "Var skatīt visu informāciju"
   → **Publicēt** → nokopē **ICS** saiti.
2. Ieraksti to `MagicMirror/secrets.js` (saite satur slepenu atslēgu, tāpēc
   ne config.js):
   ```js
   calendarFeeds: [
       { name: "Outlook", url: "https://outlook.office365.com/owa/calendar/…/calendar.ics" }
   ]
   ```
3. Restartē MagicMirror.

Outlook notikumi tiek apvienoti ar Google notikumiem — tie redzami moduļa
sarakstā, dienas plānā (MMM-CalendarAgenda), mēneša kalendārā un saņem
atgādinājumus. Atkārtotos notikumus izvērš `node-ical`. Der jebkura ICS
saite (iCloud, Nextcloud, `webcal://` …). Google pieslēgums nav obligāts —
var lietot tikai Outlook. Outlook publicēto kalendāru atjaunina ar
aizkavi (parasti dažas minūtes līdz stundai).

## Atgādinājumi

`reminderMinutes` pirms notikuma sākuma spogulis parāda paziņojumu ar 🔔
(caur iebūvēto `alert` moduli) un pārraida `CALENDAR_REMINDER` — tas
pamodina ekrānsaudzētāju (MMM-Screensaver). Visas dienas notikumiem
atgādinājums ir tās dienas rītā (`allDayReminderTime`). Katrs atgādinājums
tiek parādīts vienreiz.

## Kāpēc ne vienkārši "Sign in with Google" poga?

Parastajai OAuth pogai vajag publisku HTTPS callback adresi (piem.
`https://tavadomena.lv/oauth/callback`), ko spogulis mājas tīklā bez
domēna nevar piedāvāt. Device flow šo problēmu apiet — nekāda callback
servera nav vajadzīgs, autorizācija notiek pilnībā lietotāja pusē.

## Piezīmes

- Pieslēguma dati (`refresh token`) tiek glabāti
  `MagicMirror/data/google-token.json` (tikai īpašniekam lasāms, nav Git).
  Ne moduļa mapē, jo MagicMirror visu `modules/` atdod pa HTTP, un tad
  tokenu varētu lejupielādēt jebkurš tīklā. Vecais `token.json` no moduļa
  mapes tiek pārvietots automātiski. Lai atslēgtu kontu, izdzēs šo failu un
  restartē MagicMirror, un parādīsies jauns pieslēgšanās kods.
- Ja lietotājs kontā atsauc piekļuvi ("Manage third-party access" Google
  kontā), spogulis to pamana nākamajā vaicājumā un automātiski parāda
  jaunu pieslēgšanās kodu.
- Notikumu izvēršanu (arī atkārtotus, piem. "katru pirmdienu") veic pati
  Google Calendar API (`singleEvents=true`) — modulim tas nav jādara pašam.
