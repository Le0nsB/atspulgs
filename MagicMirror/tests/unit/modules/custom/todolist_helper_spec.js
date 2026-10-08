/* Vienībtesti MMM-TodoList: SQLite glabātuve (atmiņā), ierakstu meklēšana
 * pēc teiktā nosaukuma, balss komandas un telefona lapas API. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const NodeModule = require("node:module");
const { DatabaseSync } = require("node:sqlite");

const HELPER_PATH = path.resolve(__dirname, "../../../../modules/MMM-TodoList/node_helper.js");
const { TodoStore, DONE_KEEP_MS } = require(path.resolve(__dirname, "../../../../modules/MMM-TodoList/db.js"));

/**
 * Ielādē node_helper ar mocktiem `node_helper`/`logger` moduļiem.
 * @returns {object} node_helper definīcija ar reālām metodēm.
 */
function loadHelper () {
	vi.resetModules();
	delete require.cache[HELPER_PATH];
	const originalRequire = NodeModule.prototype.require;
	NodeModule.prototype.require = function (id) {
		if (id === "node_helper") return { create: (def) => def };
		if (id === "logger") return { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		return originalRequire.apply(this, arguments);
	};
	try {
		return require(HELPER_PATH);
	} finally {
		NodeModule.prototype.require = originalRequire;
	}
}

describe("MMM-TodoList TodoStore", () => {
	let store;

	beforeEach(() => {
		store = new TodoStore(":memory:");
	});

	afterEach(() => store.close());

	it("pievieno ierakstus saraksta beigās un nedublē vienādus", () => {
		store.add("shopping", "Piens");
		store.add("shopping", "  Maize  ");
		const again = store.add("shopping", "piens");
		expect(again.added).toBe(false);
		expect(store.open("shopping").map((i) => i.content)).toEqual(["Piens", "Maize"]);
		expect(store.open("tasks")).toEqual([]);
	});

	it("clearAll iztukšo abus sarakstus (arī atzīmētos)", () => {
		store.add("tasks", "A");
		const b = store.add("shopping", "Piens").item;
		store.setDone(b.id, true);
		expect(store.clearAll()).toBe(2);
		expect(store.open("tasks")).toEqual([]);
		expect(store.done("shopping")).toEqual([]);
	});

	it("noraida tukšu tekstu un nezināmu sarakstu", () => {
		expect(() => store.add("shopping", "   ")).toThrow("Ieraksti");
		expect(() => store.add("nav", "X")).toThrow("Nezināms");
		expect(() => store.add("shopping", "x".repeat(201))).toThrow("par garu");
	});

	it("atzīmē un atjauno (atjaunotais atgriežas beigās)", () => {
		const a = store.add("tasks", "A").item;
		store.add("tasks", "B");
		store.setDone(a.id, true);
		expect(store.open("tasks").map((i) => i.content)).toEqual(["B"]);
		expect(store.done("tasks").map((i) => i.content)).toEqual(["A"]);
		store.setDone(a.id, false);
		expect(store.open("tasks").map((i) => i.content)).toEqual(["B", "A"]);
		expect(store.done("tasks")).toEqual([]);
	});

	it("pārkārto ar move un neiziet ārpus robežām", () => {
		store.add("tasks", "A");
		store.add("tasks", "B");
		const c = store.add("tasks", "C").item;
		expect(store.move(c.id, -1)).toBe(true);
		expect(store.open("tasks").map((i) => i.content)).toEqual(["A", "C", "B"]);
		const a = store.open("tasks")[0];
		expect(store.move(a.id, -1)).toBe(false);
	});

	it("pārsauc, dzēš un notīra atzīmētos", () => {
		const a = store.add("shopping", "Pien").item;
		store.rename(a.id, "Piens");
		expect(store.get(a.id).content).toBe("Piens");
		const b = store.add("shopping", "Maize").item;
		store.setDone(b.id, true);
		expect(store.clearDone("shopping")).toBe(1);
		expect(store.remove(a.id)).toBe(true);
		expect(store.open("shopping")).toEqual([]);
	});

	it("purgeOldDone dzēš tikai sen atzīmētos", () => {
		const now = Date.now();
		const old = store.add("shopping", "Vecs").item;
		const fresh = store.add("shopping", "Jauns").item;
		store.setDone(old.id, true, now - DONE_KEEP_MS - 1000);
		store.setDone(fresh.id, true, now);
		expect(store.purgeOldDone(now)).toBe(1);
		expect(store.done("shopping").map((i) => i.content)).toEqual(["Jauns"]);
	});

	it("move pieņem tikai -1 vai 1 (ne 0, 100 vai NaN)", () => {
		store.add("tasks", "A");
		const b = store.add("tasks", "B").item;
		for (const bad of [0, 100, -2, Number.NaN, Number("abc")]) {
			expect(() => store.move(b.id, bad)).toThrow("Nepareizs virziens");
		}
		expect(store.open("tasks").map((i) => i.content)).toEqual(["A", "B"]);
	});

	it("rename nevar izveidot dublikātu nepabeigtajos (reģistrs neskaitās)", () => {
		store.add("shopping", "Piens");
		const b = store.add("shopping", "Maize").item;
		expect(() => store.rename(b.id, "piens")).toThrow("jau ir");
		expect(store.get(b.id).content).toBe("Maize");
		// Tas pats ieraksts ar citu reģistru — atļauts.
		expect(store.rename(b.id, "MAIZE").content).toBe("MAIZE");
	});

	it("dublikātu nepieļauj pati datubāze (unikāls indekss), ne tikai add()", () => {
		store.add("shopping", "Piens");
		const insert = store.db.prepare("INSERT INTO todo_items (list, content, position, created_at) VALUES ('shopping', 'PIENS', 9, 0)");
		expect(() => insert.run()).toThrow(/UNIQUE/);
		// Citā sarakstā vai atzīmētam — drīkst.
		store.add("tasks", "Piens");
		const done = store.add("shopping", "Maize").item;
		store.setDone(done.id, true);
		expect(store.add("shopping", "Maize").added).toBe(true);
	});

	it("atzīmētā atjaunošana saplūst ar tādu pašu nepabeigtu ierakstu", () => {
		const a = store.add("shopping", "Piens").item;
		store.setDone(a.id, true);
		const b = store.add("shopping", "Piens").item;
		expect(store.setDone(a.id, false).id).toBe(b.id);
		expect(store.open("shopping").map((i) => i.id)).toEqual([b.id]);
		expect(store.get(a.id)).toBeNull();
	});

	it("atverot vecu datubāzi, dzēš agrāk radušos dublikātus (paturot vecāko)", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "todo-"));
		const file = path.join(dir, "todo.db");
		try {
			new TodoStore(file).close();
			const raw = new DatabaseSync(file);
			raw.exec("DROP INDEX todo_items_open_unique");
			raw.exec("INSERT INTO todo_items (list, content, position, created_at) VALUES ('tasks', 'Veļa', 1, 0), ('tasks', 'veļa', 2, 0), ('tasks', 'Trauki', 3, 0)");
			raw.close();
			const reopened = new TodoStore(file);
			expect(reopened.open("tasks").map((i) => i.content)).toEqual(["Veļa", "Trauki"]);
			reopened.close();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("MMM-TodoList node_helper", () => {
	let helper;

	beforeEach(() => {
		helper = loadHelper();
		helper.store = new TodoStore(":memory:");
		helper.recent = new Map();
		helper.sendSocketNotification = vi.fn();
	});

	afterEach(() => {
		helper.store.close();
		vi.restoreAllMocks();
	});

	describe("findBestItem", () => {
		const items = [
			{ id: 1, content: "Piens" },
			{ id: 2, content: "Rudzu maize" },
			{ id: 3, content: "Āboli" },
			{ id: 4, content: "Izmazgāt veļu" }
		];

		it("atrod ierakstu, lai gan teikts citā locījumā", () => {
			expect(helper.findBestItem(items, "pienu").id).toBe(1);
			expect(helper.findBestItem(items, "maizi").id).toBe(2);
			expect(helper.findBestItem(items, "ābolus").id).toBe(3);
		});

		it("pieļauj atpazīšanas kļūdu un garumzīmju trūkumu", () => {
			expect(helper.findBestItem(items, "izmazgaju velu").id).toBe(4);
		});

		it("neko neatrod, ja nekas nesakrīt", () => {
			expect(helper.findBestItem(items, "kafiju")).toBeNull();
		});
	});

	it("capitalize saglabā garumzīmes", () => {
		expect(helper.capitalize("ābolus")).toBe("Ābolus");
	});

	it("\"nopirku pienu\" atzīmē Piens un paziņo visiem klientiem", () => {
		helper.store.add("shopping", "Maize");
		helper.store.add("shopping", "Piens");
		helper.socketNotificationReceived("TODOLIST_COMPLETE", { list: "shopping", text: "pienu" });
		expect(helper.store.open("shopping").map((i) => i.content)).toEqual(["Maize"]);
		expect(helper.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_DONE", { list: "shopping", content: "Piens" });
		expect(helper.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_DATA", expect.objectContaining({ shopping: [expect.objectContaining({ content: "Maize" })] }));
	});

	it("ja iepirkumos nav, meklē uzdevumos", () => {
		helper.store.add("tasks", "Izmazgāt veļu");
		helper.completeMatching("shopping", "veļu");
		expect(helper.store.open("tasks")).toEqual([]);
	});

	it("ziņo TODOLIST_NOT_FOUND, ja neviens ieraksts nesakrīt", () => {
		helper.store.add("shopping", "Maize");
		helper.completeMatching("shopping", "kafiju");
		expect(helper.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_NOT_FOUND", { list: "shopping", text: "kafiju" });
	});

	it("bez nosaukuma atzīmē augšējo ierakstu", () => {
		helper.store.add("tasks", "Pirmais");
		helper.store.add("tasks", "Otrais");
		helper.socketNotificationReceived("TODOLIST_COMPLETE", { list: "tasks", text: "" });
		expect(helper.store.open("tasks").map((i) => i.content)).toEqual(["Otrais"]);
	});

	it("TODOLIST_ADD pievieno ar lielo burtu un garumzīmēm", () => {
		helper.socketNotificationReceived("TODOLIST_ADD", { list: "shopping", text: "ābolus" });
		expect(helper.store.open("shopping").map((i) => i.content)).toEqual(["Ābolus"]);
		expect(helper.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_ADDED", { list: "shopping", content: "Ābolus" });
	});

	it("to pašu balss komandu no diviem klientiem izpilda vienreiz", () => {
		helper.socketNotificationReceived("TODOLIST_ADD", { list: "shopping", text: "maizi" });
		helper.store.remove(helper.store.open("shopping")[0].id);
		helper.socketNotificationReceived("TODOLIST_ADD", { list: "shopping", text: "maizi" });
		expect(helper.store.open("shopping")).toEqual([]);
	});

	it("ignorē nezināmu sarakstu", () => {
		helper.socketNotificationReceived("TODOLIST_ADD", { list: "hack", text: "x" });
		expect(helper.sendSocketNotification).not.toHaveBeenCalled();
	});

	describe("telefona lapas API", () => {
		let routes;
		const call = (route, body) => {
			let status = 200;
			let payload;
			const res = {
				status (code) {
					status = code;
					return this;
				},
				json (data) {
					payload = data;
				},
				set () {},
				sendFile () {}
			};
			routes[route].at(-1)({ body }, res);
			return { status, payload };
		};

		beforeEach(() => {
			routes = {};
			const register = (method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; };
			helper.expressApp = { get: register("GET"), post: register("POST") };
			helper.registerRoutes();
		});

		it("add -> spogulis saņem jauno sarakstu un telefons pilnu stāvokli", () => {
			const { status, payload } = call("POST /todo/api/add", { list: "shopping", content: "Piens" });
			expect(status).toBe(200);
			expect(payload.shopping.map((i) => i.content)).toEqual(["Piens"]);
			expect(payload.done).toEqual({ tasks: [], shopping: [] });
			expect(helper.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_DATA", expect.objectContaining({ shopping: [expect.objectContaining({ content: "Piens" })] }));
		});

		it("done un kļūdas atbilde ar 400", () => {
			const id = helper.store.add("tasks", "A").item.id;
			expect(call("POST /todo/api/done", { id, done: true }).payload.done.tasks).toHaveLength(1);
			const bad = call("POST /todo/api/add", { list: "shopping", content: "" });
			expect(bad.status).toBe(400);
			expect(bad.payload.error).toContain("Ieraksti");
		});

		it("POST: vispirms pieslēgta telefona pārbaude, tad tikai JSON, tad darbība", () => {
			expect(routes["POST /todo/api/add"]).toHaveLength(3);
			expect(routes["POST /todo/api/add"][1].name).toBe("json");
		});

		it("nepieslēgts telefons saņem 401 un nekas nemainās", () => {
			for (const key of Object.keys(routes).filter((k) => k.includes("/todo/api/"))) {
				const [guard] = routes[key];
				const res = { status: vi.fn(function () { return this; }), json: vi.fn() };
				const next = vi.fn();
				guard({ headers: { host: "localhost:8080" }, socket: { remoteAddress: "192.168.1.20" } }, res, next);
				expect({ key, called: next.mock.calls.length }).toEqual({ key, called: 0 });
				expect(res.status).toHaveBeenCalledWith(401);
			}
		});

		it("move ar nederīgu virzienu -> 400", () => {
			helper.store.add("tasks", "A");
			const b = helper.store.add("tasks", "B").item;
			expect(call("POST /todo/api/move", { id: b.id, direction: "abc" }).status).toBe(400);
			expect(call("POST /todo/api/move", { id: b.id, direction: 0 }).status).toBe(400);
			expect(call("POST /todo/api/move", { id: b.id, direction: -1 }).status).toBe(200);
		});
	});
});
