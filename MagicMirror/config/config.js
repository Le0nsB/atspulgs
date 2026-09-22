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
// Spotify atslēgas šeit NAV: MagicMirror atdod visu šo failu pārlūkam (/config), bet
// config/ mape tiek atdota arī pa HTTP kā statiski faili. Tāpēc atslēgas glabājas
// MagicMirror/secrets.js (ārpus config/ un modules/) un tās ielasa tikai node_helper
// (MMM-SpotifyNowPlaying, MMM-SpotifyDetail). Skat. secrets.js.sample.

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
				// Papildu poga "Treniņi" tālvadības sākumizvēlnē (config/custom_menu.json;
				// `type: "link"` ir šī projekta papildinājums remote-menu-ui.mjs).
				customMenu: "custom_menu.json"
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
					anytime: [
						"Sveiks!", "Kā sokās?", "Viss bumbās", "¯\\_(ツ)_/¯", "ᕙ( ͡° ͜ʖ ͡°)ᕗ", "ಠ_ಠ",
						"Lieliski izskaties!", "٩(◕‿◕)۶", "Turies!", "(⌐■_■)", "Tu vari to izdarīt!",
						"ʕ•ᴥ•ʔ", "Šodien ir tava diena!"
					],
					morning: [
						"Labrīt!", "Lai jauka diena!", "Enerģijas pilna diena tev priekšā!",
						"Kafija gaida", "Celies un spīdi!"
					],
					afternoon: [
						"Izskaties lieliski!", "Puse dienas jau aiz muguras!", "Turpini tāpat!",
						"Laiks īsai pauzei?"
					],
					evening: [
						"Kā pagāja diena?", "Atpūsties, esi pelnījis.", "Saldu nakti jau tuvojas.",
						"Diena paveikta — labi padarīts!"
					]
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
				// Kamera pēc nosaukuma (der gan Mac, gan Pi). Ja tādas nav, tiek
				// izmantota noklusējuma kamera. Konkrētu id vari norādīt ar `deviceId`.
				deviceLabel: "C270",
				showPreview: true, // mazs kameras priekšskatījums (var izslēgt)
				// 1/2/3 pirksti vairs nepārslēdz uz konkrētu lapu — lapas maina ar swipe.
				oneFinger: null,
				twoFingers: null,
				threeFingers: null,
				fist: "NEWSDETAIL_NEXT", // dūre -> nākamā ziņa (detalizēto ziņu lapā)
				openPalm: "PAGES_HOME", // atvērta plauksta -> sākums
				// Pāršķiršana ar roku: paceli roku aktīvajā zonā un pāvelc pa kreisi/labi,
				// lai pārietu uz iepriekšējo/nākamo MMM-Pages lapu.
				swipeEnabled: true,
				onSwipeLeft: "PAGES_PREV",
				onSwipeRight: "PAGES_NEXT"
			}
		},
		{
			// Rāda pašlaik atskaņoto Spotify dziesmu (skat. moduļa README.md par
			// clientId/clientSecret/refreshToken iegūšanu).
			module: "MMM-SpotifyNowPlaying",
			position: "bottom_left",
			config: {
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
			config: {}
		},
		{
			// Ziņas detalizēti — atsevišķa lapa. Viena ziņa vienlaikus,
			// pilns kopsavilkums; rotē pati, dūre = nākamā ziņa.
			module: "MMM-NewsDetail",
			position: "middle_center",
			config: {
				sourceLabel: "LSM.lv"
			}
		},
		{
			// Mājas treniņi — atsevišķa lapa ar šodienas treniņu. Ko trenēt un kāds
			// inventārs ir, izvēlas telefonā: http://<pi-ip>:8080/routines. Kad kāds
			// pienāk pie spoguļa (MMM-FaceRecognition), pajautā, vai treniņš pabeigts
			// (ne biežāk kā reizi stundā); atbilde ar balsi: "Spoguli, treniņš pabeigts"
			// (skat. moduļa README.md).
			module: "MMM-Routines",
			position: "middle_center",
			config: {}
		},
		{
			// Klātbūtnes noteikšana ar kameru (MediaPipe FaceDetector, NAV identitātes
			// atpazīšana) — ieslēdz/izslēdz ekrānu caur MMM-Remote-Control. Vajag:
			// moduļa mapē `npm install` UN palaist ar ELECTRON_ENABLE_GPU=1, UN
			// MMM-Remote-Control jābūt sarakstā (skat. moduļa README.md).
			module: "MMM-FaceRecognition",
			config: {
				// Kamera pēc nosaukuma (der gan Mac, gan Pi). Ja tādas nav, tiek
				// izmantota noklusējuma kamera. Konkrētu id vari norādīt ar `deviceId`.
				deviceLabel: "C270",
				absentTimeoutMs: 30 * 1000 // 30 s bez sejas -> ekrāns izslēdzas
			}
		},
		{
			// Ekrānsaudzētājs pēc 1 min neaktivitātes — balts LCD pulkstenis
			// (Matrix un ikosaedrs ir moduļa kodā, bet šeit izslēgti; pievieno
			// atpakaļ caur `screensavers`, skat. MMM-Screensaver README.md). Pamostas no peles/tastatūras/
			// pieskāriena UN no žestiem/balss/tālvadības (skat.
			// activityNotifications moduļa noklusējumos). Jābūt MMM-Pages
			// `fixed` sarakstā, citādi lapu pārslēgšana to paslēptu.
			module: "MMM-Screensaver",
			position: "fullscreen_above",
			config: {
				timeout: 60 * 1000,
				screensavers: ["clock"],
				clock: { color: "#ffffff", glowBlur: 20, showSeconds: true, showDate: true }
			}
		},
		{
			// Rāda pilnekrāna WiFi iestatīšanas instrukcijas, kamēr comitup ir
			// HOTSPOT/CONNECTING režīmā (skat. scripts/comitup/). Pati parādās/
			// pazūd atkarībā no stāvokļa, tāpēc konfigurācijā nav jāieslēdz nekas
			// papildu. Jābūt MMM-Pages `fixed` sarakstā, citādi lapu pārslēgšana
			// to paslēptu tieši tad, kad tā vajadzīga.
			module: "MMM-WifiSetup",
			position: "fullscreen_above"
		},
		{
			// Lapu pārslēdzējs: kreisais/labais bulttaustiņš vai žesti (MMM-GestureNav).
			module: "MMM-Pages",
			config: {
				home: 1,
				fixed: ["clock", "alert", "updatenotification", "MMM-GestureNav", "MMM-VoiceCommands", "MMM-FaceRecognition", "MMM-Screensaver", "MMM-WifiSetup"],
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
					["MMM-SpotifyDetail"],
					["MMM-Routines"]
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
