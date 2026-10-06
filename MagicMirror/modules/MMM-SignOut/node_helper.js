/* node_helper priekš MMM-SignOut
 *
 * Tikai atdod telefona lapu /signout. Pašu atslēgšanu dara katrs modulis ar
 * savu API (lapa tos izsauc pēc kārtas), tāpēc šeit nav jāzina, kur un kā
 * katrs modulis glabā datus:
 *   POST /calendar/api/signout  — atsauc Google piekļuvi, spogulī jauns pieslēgšanās kods
 *   POST /spotify/api/disconnect — aizmirst Spotify kontu (lietotnes atslēgas paliek)
 *   POST /todo/api/reset        — iztukšo uzdevumu un iepirkumu sarakstu
 *   POST /routines/api/reset    — dzēš treniņu izvēles, līmeni un vēsturi
 */
const NodeHelper = require("node_helper");
const path = require("node:path");

module.exports = NodeHelper.create({
	start () {
		this.expressApp.get("/signout", (req, res) => {
			res.set("Cache-Control", "no-cache");
			res.sendFile(path.join(__dirname, "public", "index.html"));
		});
	}
});
