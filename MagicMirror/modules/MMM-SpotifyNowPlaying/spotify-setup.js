/* Spotify pieslēgšana no telefona — lapa http://<pi-ip>:8080/spotify
 *
 *   1. (vienreiz) Client ID + Client Secret no developer.spotify.com — ievada
 *      lapā; pārbaudām pie Spotify, pirms saglabājam.
 *   2. "Pieslēgt Spotify" -> Spotify pieteikšanās -> atpakaļ spogulī.
 *
 * Kāpēc starplapa: kopš 2025. gada Spotify atļauj redirect URI tikai ar
 * HTTPS vai http://127.0.0.1 — ne http://192.168.x.x. Tāpēc Spotify sūta
 * lietotāju uz statisku HTTPS lapu (GitHub Pages, repozitorija docs/
 * spotify-callback.html), kas to tūlīt pāradresē uz spoguli mājas tīklā
 * (spoguļa adrese ir `state` parametrā). Starplapa pati neko neglabā un
 * kodu nevar izmantot bez Client Secret, kas ir tikai spogulī.
 *
 * Dati: MagicMirror/data/spotify.json (tikai īpašniekam lasāms, ārpus
 * modules/, jo to MagicMirror atdod pa HTTP). Abi Spotify moduļi šo failu
 * vēro un pārlādē atslēgas bez restarta.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const ME_URL = "https://api.spotify.com/v1/me";
const SCOPE = "user-read-currently-playing user-read-playback-state user-modify-playback-state user-read-private";
const DEFAULT_RELAY = "https://le0nsb.github.io/atspulgs/spotify-callback.html";
const HEX32 = /^[0-9a-f]{32}$/i;
const LOGIN_TTL_MS = 15 * 60 * 1000;

const b64url = (s) => Buffer.from(s).toString("base64url");

function readJson (file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return {};
	}
}

class SpotifySetup {
	constructor ({ dataFile, relayUrl, log, fetchImpl }) {
		this.dataFile = dataFile;
		this.relayUrl = relayUrl || DEFAULT_RELAY;
		this.log = log || console;
		this.fetch = fetchImpl || ((...a) => fetch(...a));
		this.logins = new Map(); // nonce -> { origin, expires }
	}

	read () {
		return readJson(this.dataFile);
	}

	write (data) {
		fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
		fs.writeFileSync(this.dataFile, JSON.stringify(data, null, "\t"), { mode: 0o600 });
	}

	// Stāvoklis telefona lapai — bez Client Secret un tokeniem.
	state (legacyConnected = false) {
		const d = this.read();
		return {
			hasApp: Boolean(d.clientId && d.clientSecret),
			connected: Boolean(d.clientId && d.clientSecret && d.refreshToken),
			legacy: legacyConnected && !d.refreshToken, // atslēgas vēl secrets.js (vecais veids)
			clientId: d.clientId || "",
			account: d.account || null,
			redirectUri: this.relayUrl
		};
	}

	basicAuth (clientId, clientSecret) {
		return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
	}

	async saveApp (clientIdRaw, clientSecretRaw) {
		const clientId = String(clientIdRaw || "").trim();
		const clientSecret = String(clientSecretRaw || "").trim();
		if (!HEX32.test(clientId)) throw new Error("Client ID jābūt 32 simboliem (0-9, a-f). Nokopē to vēlreiz no Spotify lietotnes Settings.");
		if (!HEX32.test(clientSecret)) throw new Error("Client Secret jābūt 32 simboliem. Spotify lietotnē spied \"View client secret\" un nokopē.");
		// Pārbaudām, ka pāris tiešām der, pirms saglabājam.
		const res = await this.fetch(TOKEN_URL, {
			method: "POST",
			headers: { Authorization: this.basicAuth(clientId, clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "client_credentials" })
		});
		if (!res.ok) throw new Error("Spotify nepieņēma šo Client ID / Client Secret. Pārbaudi, vai tie ir no tās pašas lietotnes.");
		const old = this.read();
		// Cita lietotne -> vecais pieslēgums vairs neder.
		const keep = old.clientId === clientId ? { refreshToken: old.refreshToken, account: old.account } : {};
		this.write({ ...keep, clientId, clientSecret });
	}

	// `origin` — spoguļa adrese, kā to redz telefons (piem. http://192.168.1.5:8080).
	loginUrl (origin) {
		const d = this.read();
		if (!d.clientId) throw new Error("Vispirms saglabā Spotify lietotnes Client ID un Secret.");
		const now = Date.now();
		for (const [k, v] of this.logins) if (v.expires < now) this.logins.delete(k);
		const nonce = crypto.randomBytes(16).toString("hex");
		this.logins.set(nonce, { origin, expires: now + LOGIN_TTL_MS });
		const state = b64url(JSON.stringify({ m: origin, n: nonce }));
		return `${AUTHORIZE_URL}?${new URLSearchParams({
			response_type: "code",
			client_id: d.clientId,
			scope: SCOPE,
			redirect_uri: this.relayUrl,
			state,
			show_dialog: "true"
		}).toString()}`;
	}

	// Atgriešanās no Spotify (caur starplapu). Atgriež konta nosaukumu.
	async callback ({ code, state, error }) {
		if (error) throw new Error(error === "access_denied" ? "Pieslēgšana atcelta." : `Spotify kļūda: ${error}`);
		let nonce = null;
		try {
			nonce = JSON.parse(Buffer.from(String(state || ""), "base64url").toString("utf8")).n;
		} catch {
			// zemāk — nederīgs
		}
		const login = nonce && this.logins.get(nonce);
		if (!login || login.expires < Date.now()) throw new Error("Pieslēgšanas saite ir novecojusi. Mēģini vēlreiz.");
		this.logins.delete(nonce);
		if (!code) throw new Error("Spotify neatsūtīja pieslēgšanās kodu.");

		const d = this.read();
		const res = await this.fetch(TOKEN_URL, {
			method: "POST",
			headers: { Authorization: this.basicAuth(d.clientId, d.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "authorization_code", code: String(code), redirect_uri: this.relayUrl })
		});
		const tokens = await res.json().catch(() => ({}));
		if (!res.ok || !tokens.refresh_token) {
			const why = tokens.error_description || tokens.error || res.status;
			if (String(why).includes("redirect_uri")) {
				throw new Error(`Spotify lietotnē nav pievienots Redirect URI ${this.relayUrl}`);
			}
			throw new Error(`Neizdevās pieslēgt Spotify (${why}).`);
		}

		let account = null;
		try {
			const me = await this.fetch(ME_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
			if (me.ok) {
				const info = await me.json();
				account = { name: info.display_name || info.id || "", product: info.product || null };
			} else if (me.status === 403) {
				// Development mode: konts nav pievienots lietotnes "User Management".
				throw new Error("Šim Spotify kontam nav piekļuves lietotnei. Spotify Dashboard -> tava lietotne -> User Management pievieno sava Spotify konta e-pastu.");
			}
		} catch (err) {
			if (err.message.startsWith("Šim Spotify")) throw err;
		}
		this.write({ ...d, refreshToken: tokens.refresh_token, account });
		return account;
	}

	disconnect () {
		const d = this.read();
		delete d.refreshToken;
		delete d.account;
		this.write(d);
	}

	// Pilnībā aizmirst lietotni (lai ievadītu citu Client ID).
	reset () {
		try {
			fs.unlinkSync(this.dataFile);
		} catch {
			// nav faila — nekas nav jādara
		}
	}
}

// Nolasa pieslēguma atslēgas no data/spotify.json (jaunais veids). null, ja nepilnīgas.
function loadFromDataFile (file) {
	const { clientId, clientSecret, refreshToken } = readJson(file);
	return clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null;
}

module.exports = { SpotifySetup, loadFromDataFile, SCOPE, DEFAULT_RELAY };
