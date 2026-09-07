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
{
	const path = require("node:path");
	const base = (typeof global !== "undefined" && global.root_path) ? global.root_path : process.cwd();
	const candidates = [
		path.join(base, "config", "secrets.js"),
		path.join(base, "secrets.js"),
		"./secrets"
	];
	for (const candidate of candidates) {
		try {
			secrets = require(candidate);
			break;
		} catch (e) {
			// mēģinām nākamo ceļu
		}
	}
}

let config = {
	address: "localhost",	// Address to listen on, can be:
							// - "localhost", "127.0.0.1", "::1" to listen on loopback interface
							// - another specific IPv4/6 to listen on a specific interface
							// - "0.0.0.0", "::" to listen on any interface
							// Default, when address config is left out or empty, is "localhost"
	port: 8080,
	basePath: "/",	// The URL path where MagicMirror² is hosted. If you are using a Reverse proxy
									// you must set the sub path here. basePath must end with a /
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1"],	// Set [] to allow all IP addresses
									// or add a specific IPv4 of 192.168.1.5 :
									// ["127.0.0.1", "::ffff:127.0.0.1", "::1", "::ffff:192.168.1.5"],
									// or IPv4 range of 192.168.3.0 --> 192.168.3.15 use CIDR format :
									// ["127.0.0.1", "::ffff:127.0.0.1", "::1", "::ffff:192.168.3.0/28"],

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
					anytime: ["Sveiks!", "Kā sokās?", "Viss bumbās", "¯\_(ツ)_/¯", "ᕙ( ͡° ͜ʖ ͡°)ᕗ", "ಠ_ಠ"],
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
				lat: 57.311886,
				lon: 25.274975
			}
		},
		{
			module: "weather",
			position: "top_right",
			header: "Weather Forecast",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: 57.311886,
				lon: 25.274975
			}
		},
		{
			// Kreisā lapa (bulttaustiņš pa kreisi): visas nedēļas laika prognoze.
			module: "MMM-WeekWeather",
			position: "middle_center",
			header: "Nedēļas laikapstākļi",
			config: {
				lat: 57.311886,
				lon: 25.274975
			}
		},
		{
			// Labā lapa (bulttaustiņš pa labi): tekošā mēneša kalendārs ar vārda dienām.
			module: "MMM-MonthCalendar",
			position: "middle_center",
			config: {}
		},
		{
			// Roku žestu navigācija (statiski žesti — rādi pirkstus un turi ~0,5 s).
			// Vajag: moduļa mapē `npm install` UN palaist ar ELECTRON_ENABLE_GPU=1.
			module: "MMM-GestureNav",
			position: "bottom_right",
			config: {
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
			// Ziņas detalizēti — atsevišķa lapa (3 pirksti). Viena ziņa vienlaikus,
			// pilns kopsavilkums; rotē pati, ✊ dūre = nākamā ziņa.
			module: "MMM-NewsDetail",
			position: "middle_center",
			config: {
				sourceLabel: "LSM.lv"
			}
		},
		{
			// Lapu pārslēdzējs: kreisais/labais bulttaustiņš vai žesti (MMM-GestureNav).
			module: "MMM-Pages",
			config: {
				home: 1,
				fixed: ["clock", "alert", "updatenotification", "MMM-GestureNav"],
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
					["MMM-NewsDetail"]
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
