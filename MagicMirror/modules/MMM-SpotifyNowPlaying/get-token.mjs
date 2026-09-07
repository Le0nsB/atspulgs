#!/usr/bin/env node
/* Vienreizējs palīgs, lai iegūtu Spotify refresh token.
 *
 * Lietošana:
 *   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node get-token.mjs
 *
 * Priekšnosacījums: Spotify app dashboard (https://developer.spotify.com/dashboard)
 * kā Redirect URI jābūt pievienotam tieši:  http://127.0.0.1:8888/callback
 *
 * Skripts atver pārlūku, tu autorizē, un konsolē tiek izdrukāts refresh token,
 * ko ieliec config.js modulī kā `refreshToken`.
 */
import http from "node:http";
import { exec } from "node:child_process";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const SCOPE = "user-read-currently-playing user-read-playback-state";

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error("Trūkst SPOTIFY_CLIENT_ID vai SPOTIFY_CLIENT_SECRET vides mainīgo.");
	process.exit(1);
}

const authUrl =
	"https://accounts.spotify.com/authorize?" +
	new URLSearchParams({
		response_type: "code",
		client_id: CLIENT_ID,
		scope: SCOPE,
		redirect_uri: REDIRECT_URI
	}).toString();

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, REDIRECT_URI);
	if (url.pathname !== "/callback") {
		res.writeHead(404);
		res.end();
		return;
	}

	const code = url.searchParams.get("code");
	const error = url.searchParams.get("error");
	if (error || !code) {
		res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
		res.end(`Autorizācija neizdevās: ${error || "nav koda"}`);
		server.close();
		process.exit(1);
	}

	try {
		const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
		const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
			method: "POST",
			headers: {
				Authorization: `Basic ${basic}`,
				"Content-Type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: REDIRECT_URI
			})
		});
		const data = await tokenRes.json();
		if (!tokenRes.ok) throw new Error(JSON.stringify(data));

		res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Gatavs! Vari aizvērt šo cilni un atgriezties terminālī.");

		console.log("\n=== Spotify refresh token ===\n");
		console.log(data.refresh_token);
		console.log("\nIeliec to config.js kā `refreshToken`.\n");
	} catch (err) {
		res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Token apmaiņa neizdevās, skat. terminālī.");
		console.error(err);
	} finally {
		server.close();
		process.exit(0);
	}
});

server.listen(8888, "127.0.0.1", () => {
	console.log("Atveru pārlūkā:\n" + authUrl + "\n");
	const opener =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	exec(`${opener} "${authUrl}"`);
});
