/* node_helper priekš MMM-SignOut
 *
 * Tikai atdod telefona lapu /signout. Pašu atslēgšanu dara katrs modulis ar
 * savu API (lapa tos izsauc pēc kārtas), tāpēc šeit nav jāzina, kur un kā
 * katrs modulis glabā datus:
 *   POST /calendar/api/signout  — atsauc Google piekļuvi, spogulī jauns pieslēgšanās kods
 *   POST /spotify/api/disconnect — aizmirst Spotify kontu (lietotnes atslēgas paliek)
 *   POST /todo/api/reset        — iztukšo uzdevumu un iepirkumu sarakstu
 *   POST /routines/api/reset    — dzēš treniņu izvēles, līmeni un vēsturi
 *   POST /pair/api/reset        — aizmirst visus pieslēgtos telefonus (pēdējais!)
 * Lapu var atvērt tikai pieslēgts telefons (skat. lib/phone-auth.js).
 */
const NodeHelper = require("node_helper");
const path = require("node:path");
const phoneAuth = require("../../lib/phone-auth");

module.exports = NodeHelper.create({
	start () {
		phoneAuth.install(this.expressApp);
		this.expressApp.get("/signout", phoneAuth.page(path.join(__dirname, "public", "index.html")));
	}
});
