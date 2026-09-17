/* Config Sample
 *
 * For more information on how you can configure this file
 * see https://docs.magicmirror.builders/configuration/introduction.html
 * and https://docs.magicmirror.builders/modules/configuration.html
 *
 * You can use environment variables using a `config.js.template` file instead of `config.js`
 * which will be converted to `config.js` while starting. For more information
 * see https://docs.magicmirror.builders/configuration/introduction.html#enviromnent-variables
 */
// Privātās atslēgas nāk no config/secrets.js (netiek pievienots git).
// Ja faila nav, moduļi, kuriem vajag atslēgas, vienkārši nerādīsies.
// MagicMirror šo failu ielasa kā tekstu (bez īsta __dirname), tāpēc
// mēģinām vairākus ceļus līdz secrets.js.
let secrets = { spotify: {} };
// Tikai servera pusē (Node). Pārlūkā (piem. remote.html no telefona, kur nav
// Electron `require`) šis bloks netiek izpildīts — citādi visa config.js
// izpilde mestu "require is not defined" un `config` paliktu nedefinēts.
if (typeof require === "function") {
	const path = require("node:path");
	const base = (typeof global !== "undefined" && global.root_path) ? global.root_path : process.cwd();
	const candidates = [
		path.join(base, "config", "secrets.js"),
		path.join(base, "secrets.js")
	];
	let loaded = false;
	for (const candidate of candidates) {
		try {
			secrets = require(candidate);
			loaded = true;
			break;
		} catch (e) {
			// Fails nav šajā ceļā — mēģinām nākamo. Bet ja fails IR, tikai ar
			// sintakses kļūdu, par to jāzina — citādi moduļi klusi pazūd.
			if (e.code !== "MODULE_NOT_FOUND" || !String(e.message).includes(candidate)) {
				console.warn(`config: neizdevās ielasīt ${candidate}: ${e.message}`);
			}
		}
	}
	if (!loaded) {
		console.warn("config: secrets.js nav atrasts — moduļi, kuriem vajag atslēgas (piem. Spotify), nerādīsies.");
	}
}

// Atrašanās vieta (Cēsis) — kopīga visiem laikapstākļu moduļiem.
const LAT = 57.311886;
const LON = 25.274975;

let config = {
	// "0.0.0.0" — klausās uz visām saskarnēm, lai MagicMirror būtu pieejams no
	// citām ierīcēm tajā pašā tīklā (piem. MacBook, kas darbojas kā MMM-VoiceCommands
	// mikrofons: http://<pi-ip>:8080/?voice=listen). Ja balss komandas nevajag no
	// citām ierīcēm, atgriez "localhost".
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",	// The URL path where MagicMirror² is hosted. If you are using a Reverse proxy
									// you must set the sub path here. basePath must end with a /
	// Atļauj tikai lokālā tīkla (RFC1918) adreses: MacBook balss klausītājam
	// piekļuve ir, bet no interneta puses MagicMirror nav sasniedzams.
	// Ja tavs tīkls ir tikai 192.168.x.x, atstāj tikai to rindu vai pat
	// konkrētu MacBook IP, piem. "::ffff:192.168.1.50".
	ipWhitelist: [
		"127.0.0.1", "::ffff:127.0.0.1", "::1",
		// Abas formas: IPv6-mapētā (::ffff:) dual-stack ligzdai un tīrā IPv4
		// forma, kad MM klausās tikai uz IPv4 (piem. telefons hotspot tīklā).
		"192.168.0.0/16", "::ffff:192.168.0.0/16",
		"10.0.0.0/8", "::ffff:10.0.0.0/8",
		"172.16.0.0/12", "::ffff:172.16.0.0/12"
	],

	useHttps: false,			// Support HTTPS or not, default "false" will use HTTP
	httpsPrivateKey: "",	// HTTPS private key path, only require when useHttps is true
	httpsCertificate: "",	// HTTPS Certificate path, only require when useHttps is true

	language: "en",
	locale: "en-US",   // this variable is provided as a consistent location
			   // it is currently only used by 3rd party modules. no MagicMirror code uses this value
			   // as we have no usage, we  have no constraints on what this field holds
			   // see https://en.wikipedia.org/wiki/Locale_(computer_software) for the possibilities

	logLevel: ["INFO", "LOG", "WARN", "ERROR"], // Add "DEBUG" for even more logging
	timeFormat: 24,
	units: "metric",

	modules: [
		{
			module: "alert",
		},
		{
			module: "updatenotification",
			position: "top_bar"
		},
		{
			// Tālvadība caur pārlūku: http://<pi-ip>:8080/remote.html
			// (izslēgt/restartēt Pi, pārstartēt MM, ieslēgt/izslēgt moduļus,
			// mainīt config). Bez position — nekas nav redzams uz ekrāna.
			// API ir aizsargāts tikai ar ipWhitelist; ja vajag arī apiKey,
			// ģenerē ar `node --run generate-apikey` moduļa mapē un pievieno šeit.
			module: "MMM-Remote-Control",
			config: {
				// customCommand: {},
				// apiKey: ""
			}
		},
		{
			module: "clock",
			position: "top_left"
		},
		{
			// Redzamais saraksts sākumlapā — tikai tuvākie svētki, lai neaizņem visu ekrānu.
			module: "calendar",
			header: "Brīvdienas Latvijā",
			position: "top_left",
			config: {
				maximumEntries: 5,
				maximumNumberOfDays: 400,
				calendars: [
					{
						fetchInterval: 7 * 24 * 60 * 60 * 1000,
						symbol: "calendar-check",
						url: "https://calendar.google.com/calendar/ical/lv.latvian%23holiday%40group.v.calendar.google.com/public/basic.ics"
					}
				]
			}
		},
		{
			// Neredzams (nav position) — baro MMM-MonthCalendar ar visa gada svētkiem,
			// ieskaitot jau pagājušos šī mēneša datumus.
			module: "calendar",
			config: {
				broadcastPastEvents: true,
				maximumEntries: 60,
				maximumNumberOfDays: 400,
				calendars: [
					{
						fetchInterval: 7 * 24 * 60 * 60 * 1000,
						url: "https://calendar.google.com/calendar/ical/lv.latvian%23holiday%40group.v.calendar.google.com/public/basic.ics"
					}
				]
			}
		},
		{
			module: "MMM-Namedays",
			header: "Vārda diena",
			position: "top_left",
			config: {
				useExtended: false,
				prefix: ""
			}
		},
		{
			module: "compliments",
			position: "lower_third",
			config: {
				compliments: {
					anytime: ["Sveiks!", "Kā sokās?", "Viss bumbās", "¯\\_(ツ)_/¯", "ᕙ( ͡° ͜ʖ ͡°)ᕗ", "ಠ_ಠ"],
					morning: ["Labrīt!", "Lai jauka diena!"],
					afternoon: ["Izskaties lieliski!"],
					evening: ["Kā pagāja diena?"]
				}
			}
		},
		{
			module: "MMM-DailyVerse",
			position: "lower_third",
			config: {
				mode: "daily"
			}
		},
		{
			module: "weather",
			position: "top_right",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: LAT,
				lon: LON
			}
		},
		{
			module: "weather",
			position: "top_right",
			header: "Weather Forecast",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: LAT,
				lon: LON
			}
		},
		{
			// Kreisā lapa (bulttaustiņš pa kreisi): visas nedēļas laika prognoze.
			module: "MMM-WeekWeather",
			position: "middle_center",
			header: "Nedēļas laikapstākļi",
			config: {
				lat: LAT,
				lon: LON
			}
		},
		{
			// Labā lapa (bulttaustiņš pa labi): tekošā mēneša kalendārs ar vārda dienām.
			module: "MMM-MonthCalendar",
			position: "middle_center",
			config: {}
		},
		{
			// Balss komandas latviešu valodā ar aktivācijas vārdu "Spoguli".
			// Pi displejam (Electron) nav Web Speech API, tāpēc tas darbojas
			// "display" lomā: klausās kāda cita ierīce ar Google Chrome, atverot
			// http://<pi-ip>:8080/?voice=listen (skat. moduļa README.md).
			// node_helper uz Pi pārraida atpazīto komandu visiem klientiem.
			// Noklusējuma komandas: "parādi laikapstākļus" / "parādi kalendāru" /
			// "parādi ziņas" / "nākamā ziņa" / "uz sākumu" / "nākamā lapa" /
			// "iepriekšējā lapa". Pielāgo caur `commands`.
			module: "MMM-VoiceCommands",
			position: "top_center",
			config: {
				// "auto" NEDER: Electron Chromium objekts webkitSpeechRecognition
				// EKSISTĒ (tāpēc "auto" to nekļūdīgi noteiktu par "listener"),
				// bet tīkla pieprasījums uz Google runas serveri tur vienmēr krīt
				// (nav Google API atslēgas) — skat. MMM-VoiceCommands.js:8-10.
				// Tāpēc šeit piespiedu kārtā "display"; mikrofons jāieslēdz
				// reālā Chrome cilnē: http://<pi-ip>:8080/?voice=listen
				listen: false
			}
		},
		{
			// Roku žestu navigācija (statiski žesti — rādi pirkstus un turi ~0,5 s).
			// Vajag: moduļa mapē `npm install` UN palaist ar ELECTRON_ENABLE_GPU=1.
			module: "MMM-GestureNav",
			position: "bottom_right",
			config: {
				// TODO: noņemt pirms Pi izvietošanas — šis ID der tikai šim MacBook
				// profilam (C270 HD WEBCAM), uz Pi ar `exact` constraint tas neizdosies.
				deviceId: "ed074b0952c846269468d97339dea5a2d414a28dfc8bb657dbd1e1ea4dfd4327",
				showPreview: true, // mazs kameras priekšskatījums (var izslēgt)
				oneFinger: "PAGES_GOTO", oneFingerPayload: 0, // 1 pirksts -> nedēļas laiks
				twoFingers: "PAGES_GOTO", twoFingersPayload: 2, // 2 pirksti -> mēneša kalendārs
				threeFingers: "PAGES_GOTO", threeFingersPayload: 3, // 3 pirksti -> ziņas detalizēti
				fist: "NEWSDETAIL_NEXT", // ✊ dūre -> nākamā ziņa (detalizēto ziņu lapā)
				openPalm: "PAGES_HOME" // atvērta plauksta -> sākums
			}
		},
		{
			// Rāda pašlaik atskaņoto Spotify dziesmu (skat. moduļa README.md par
			// clientId/clientSecret/refreshToken iegūšanu).
			module: "MMM-SpotifyNowPlaying",
			position: "bottom_left",
			config: {
				clientId: secrets.spotify.clientId,
				clientSecret: secrets.spotify.clientSecret,
				refreshToken: secrets.spotify.refreshToken,
				updateInterval: 15 * 1000,
				showAlbumArt: true,
				showProgress: true,
				hideWhenNothingPlaying: true
			}
		},
		{
			// Spotify detalizēti — atsevišķa lapa: griežas vinils ar albuma
			// vāciņu, rinda un sinhronizēti dziesmas vārdi (skat. moduļa
			// README.md). Izmanto tos pašus akreditācijas datus kā
			// MMM-SpotifyNowPlaying, bet ir neatkarīgs modulis (savs node_helper).
			module: "MMM-SpotifyDetail",
			position: "middle_center",
			config: {
				clientId: secrets.spotify.clientId,
				clientSecret: secrets.spotify.clientSecret,
				refreshToken: secrets.spotify.refreshToken
			}
		},
		{
			// Ziņas detalizēti — atsevišķa lapa (3 pirksti). Viena ziņa vienlaikus,
			// pilns kopsavilkums; rotē pati, ✊ dūre = nākamā ziņa.
			module: "MMM-NewsDetail",
			position: "middle_center",
			config: {
				sourceLabel: "LSM.lv"
			}
		},
		{
			// Klātbūtnes noteikšana ar kameru (MediaPipe FaceDetector, NAV identitātes
			// atpazīšana) — ieslēdz/izslēdz ekrānu caur MMM-Remote-Control. Vajag:
			// moduļa mapē `npm install` UN palaist ar ELECTRON_ENABLE_GPU=1, UN
			// MMM-Remote-Control jābūt sarakstā (skat. moduļa README.md).
			module: "MMM-FaceRecognition",
			config: {
				// TODO: noņemt pirms Pi izvietošanas — šis ID der tikai šim MacBook
				// profilam (C270 HD WEBCAM), uz Pi ar `exact` constraint tas neizdosies.
				deviceId: "ed074b0952c846269468d97339dea5a2d414a28dfc8bb657dbd1e1ea4dfd4327",
				absentTimeoutMs: 30 * 1000 // 30 s bez sejas -> ekrāns izslēdzas
			}
		},
		{
			// Ekrānsaudzētājs pēc 1 min neaktivitātes — rotē starp Matrix
			// digitālo lietu, digitālo pulksteni un lēni rotējošu ikosaedru
			// (skat. MMM-Screensaver README.md). Pamostas no peles/tastatūras/
			// pieskāriena UN no žestiem/balss/tālvadības (skat.
			// activityNotifications moduļa noklusējumos). Jābūt MMM-Pages
			// `fixed` sarakstā, citādi lapu pārslēgšana to paslēptu.
			module: "MMM-Screensaver",
			position: "fullscreen_above",
			config: {
				timeout: 60 * 1000,
				screensavers: ["matrix", "clock", "icosahedron"],
				screensaverDuration: 45 * 1000
			}
		},
		{
			// Lapu pārslēdzējs: kreisais/labais bulttaustiņš vai žesti (MMM-GestureNav).
			module: "MMM-Pages",
			config: {
				home: 1,
				fixed: ["clock", "alert", "updatenotification", "MMM-GestureNav", "MMM-VoiceCommands", "MMM-FaceRecognition", "MMM-Screensaver"],
				pages: [
					["MMM-WeekWeather"],
					[
						"calendar",
						"MMM-Namedays",
						"compliments",
						"MMM-DailyVerse",
						"weather",
						"newsfeed",
						"MMM-SpotifyNowPlaying"
					],
					["MMM-MonthCalendar"],
					["MMM-NewsDetail"],
					["MMM-SpotifyDetail"]
				]
			}
		},
		{
			module: "newsfeed",
			position: "bottom_bar",
			config: {
				feeds: [
					{
						title: "LSM.lv",
						url: "https://www.lsm.lv/rss/"
					}
				],
				showSourceTitle: true,
				showPublishDate: true,
				// Virsraksts vienā rindā (ar ...), lai josla nemainītu augstumu
				// un nepārbīdītu Spotify / citātu virs tās.
				wrapTitle: false,
				broadcastNewsFeeds: true,
				broadcastNewsUpdates: true
			}
		},
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
