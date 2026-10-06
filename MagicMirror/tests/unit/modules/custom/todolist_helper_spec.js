/* Vienībtesti MMM-TodoList: SQLite glabātuve (atmiņā), ierakstu meklēšana
 * pēc teiktā nosaukuma, balss komandas un telefona lapas API. */
const path = require("node:path");
const NodeModule = require("node:module");

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

		it("POST pieņem tikai JSON (json starpprogramma pirms darbības)", () => {
			expect(routes["POST /todo/api/add"]).toHaveLength(2);
		});
	});
});
