/* node_helper priekš MMM-TodoList
 *
 * Vaicā Todoist REST API pēc diviem projektiem — uzdevumiem un iepirkumu
 * sarakstu (projektu nosaukumi konfigurējami, noklusējumā "Uzdevumi" un
 * "Iepirkumi"). Projekta ID tiek noskaidrots vienreiz pēc nosaukuma un
 * kešots, tāpēc config'ā pietiek ar nosaukumu, ne ID.
 */
const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("node:fs");
const path = require("node:path");

// Todoist personīgais API token tiek lasīts TIKAI šeit, servera pusē, no
// MagicMirror/secrets.js. Tas nedrīkst nonākt modulī `config` (to MagicMirror
// atdod pārlūkam caur /config un /api/config) un nedrīkst atrasties mapē
// config/ vai modules/ (tās MagicMirror atdod pa HTTP kā statiskus failus).
// (Šī funkcija ir apzināti dublēta pēc MMM-SpotifyDetail parauga — moduļi ir neatkarīgi.)
function loadTodoistCredentials () {
	const root = path.resolve(__dirname, "..", "..");
	const candidates = [path.join(root, "secrets.js"), path.join(root, "config", "secrets.js")];
	for (const file of candidates) {
		if (!fs.existsSync(file)) continue;
		if (file.includes(`${path.sep}config${path.sep}`)) {
			Log.warn(`MMM-TodoList: ${file} ir lejupielādējams no tīkla (http://<ip>:8080/config/secrets.js) — pārvieto to uz ${candidates[0]}`);
		}
		try {
			const { apiToken } = require(file).todoist || {};
			return apiToken ? { apiToken } : null;
		} catch (error) {
			Log.error(`MMM-TodoList: neizdevās ielasīt ${file}: ${error.message}`);
			return null;
		}
	}
	return null;
}

const API_BASE = "https://api.todoist.com/rest/v2";

module.exports = NodeHelper.create({
	start () {
		this.config = null;
		this.token = null;
		this.timer = null;
		this.failures = 0;
		this.projectIds = { tasks: null, shopping: null }; // kešoti pēc nosaukuma
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "TODOLIST_CONFIG") {
			const credentials = loadTodoistCredentials();
			if (!credentials) {
				this.sendSocketNotification("TODOLIST_NO_CREDENTIALS");
				return;
			}
			this.config = payload;
			this.token = credentials.apiToken;
			this.failures = 0;
			this.poll();
		} else if (notification === "TODOLIST_COMPLETE") {
			this.completeOldest(payload && payload.list);
		}
	},

	scheduleNext () {
		if (!this.config) return;
		clearTimeout(this.timer);
		const base = Math.max(15000, this.config.updateInterval);
		const delay = this.failures > 0
			? Math.min(base * 2 ** Math.min(this.failures, 5), 5 * 60 * 1000)
			: base;
		this.timer = setTimeout(() => this.poll(), delay);
	},

	headers () {
		return { Authorization: `Bearer ${this.token}` };
	},

	async resolveProjectId (name, key) {
		if (this.projectIds[key]) return this.projectIds[key];
		const res = await fetch(`${API_BASE}/projects`, { headers: this.headers() });
		if (!res.ok) throw new Error(`projects ${res.status}: ${await res.text()}`);
		const projects = await res.json();
		const match = projects.find((p) => p.name.toLowerCase() === String(name).toLowerCase());
		if (!match) throw new Error(`Todoist projekts "${name}" nav atrasts`);
		this.projectIds[key] = match.id;
		return match.id;
	},

	async fetchList (name, key) {
		const projectId = await this.resolveProjectId(name, key);
		const res = await fetch(`${API_BASE}/tasks?project_id=${projectId}`, { headers: this.headers() });
		if (!res.ok) throw new Error(`tasks ${res.status}: ${await res.text()}`);
		const tasks = await res.json();
		return tasks
			.sort((a, b) => a.order - b.order)
			.map((t) => ({ id: t.id, content: t.content, due: t.due ? t.due.string : null }));
	},

	async poll () {
		if (!this.config) return;
		try {
			const [tasks, shopping] = await Promise.all([
				this.fetchList(this.config.tasksProjectName, "tasks"),
				this.fetchList(this.config.shoppingProjectName, "shopping")
			]);
			this.failures = 0;
			this.sendSocketNotification("TODOLIST_DATA", { tasks, shopping });
		} catch (err) {
			this.failures += 1;
			Log.error(`[MMM-TodoList] ${err.message} (kļūda #${this.failures})`);
			this.sendSocketNotification("TODOLIST_ERROR", err.message);
		} finally {
			this.scheduleNext();
		}
	},

	// Balss komanda / žests nezina konkrētā ieraksta ID — aizver VECĀKO
	// (augšējo) nepabeigto ierakstu attiecīgajā sarakstā, līdzīgi kā
	// MMM-Routines reaģē uz "treniņš pabeigts" bez konkrēta treniņa nosaukuma.
	async completeOldest (listKey) {
		if (!this.config) return;
		const name = listKey === "shopping" ? this.config.shoppingProjectName : this.config.tasksProjectName;
		try {
			const items = await this.fetchList(name, listKey);
			if (!items.length) return;
			const [first] = items;
			const res = await fetch(`${API_BASE}/tasks/${first.id}/close`, { method: "POST", headers: this.headers() });
			if (!res.ok && res.status !== 204) throw new Error(`close ${res.status}: ${await res.text()}`);
			await this.poll();
		} catch (err) {
			Log.error(`[MMM-TodoList] neizdevās pabeigt ierakstu: ${err.message}`);
			this.sendSocketNotification("TODOLIST_ERROR", err.message);
		}
	}
});
