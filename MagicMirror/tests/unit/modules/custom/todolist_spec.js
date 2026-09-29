/* Vienībtesti MMM-TodoList notifikāciju pārsūtīšanai un saraksta uzbūvei. */
const path = require("node:path");

const MODULE_PATH = path.resolve(__dirname, "../../../../modules/MMM-TodoList/MMM-TodoList.js");

describe("MMM-TodoList", () => {
	let mod;

	beforeEach(() => {
		vi.resetModules();
		global.Module = { register: vi.fn((name, def) => { mod = def; }) };
		global.Log = { info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		global.document = {
			createElement: (tag) => ({
				tagName: tag,
				className: "",
				innerText: "",
				innerHTML: "",
				children: [],
				appendChild (child) { this.children.push(child); }
			}),
			createTextNode: (text) => ({ nodeType: 3, textContent: text })
		};
		require(MODULE_PATH);
		mod.config = JSON.parse(JSON.stringify(mod.defaults));
		mod.sendSocketNotification = vi.fn();
		mod.tasks = [];
		mod.shopping = [];
		mod.loaded = false;
	});

	afterEach(() => vi.restoreAllMocks());

	describe("TODO_COMPLETE pārsūtīšana", () => {
		it("pārsūta uz node_helper ar to pašu sarakstu", () => {
			mod.notificationReceived("TODO_COMPLETE", { list: "shopping" });
			expect(mod.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_COMPLETE", { list: "shopping", text: "" });
		});

		it("ignorē, ja payload nav saraksta nosaukuma", () => {
			mod.notificationReceived("TODO_COMPLETE", {});
			expect(mod.sendSocketNotification).not.toHaveBeenCalled();
		});

		it("ignorē citas notifikācijas", () => {
			mod.notificationReceived("SOME_OTHER", { list: "tasks" });
			expect(mod.sendSocketNotification).not.toHaveBeenCalled();
		});
	});

	describe("socketNotificationReceived", () => {
		it("TODOLIST_DATA aizpilda sarakstus", () => {
			mod.updateDom = vi.fn();
			mod.socketNotificationReceived("TODOLIST_DATA", {
				tasks: [{ id: 1, content: "Izmazgāt veļu" }],
				shopping: [{ id: 2, content: "Maize" }]
			});
			expect(mod.loaded).toBe(true);
			expect(mod.tasks).toEqual([{ id: 1, content: "Izmazgāt veļu" }]);
			expect(mod.shopping).toEqual([{ id: 2, content: "Maize" }]);
			expect(mod.updateDom).toHaveBeenCalled();
		});

		it("TODOLIST_DONE parāda paziņojumu kā tekstu (ne HTML)", () => {
			mod.sendNotification = vi.fn();
			mod.socketNotificationReceived("TODOLIST_DONE", { list: "shopping", content: "<b>Piens</b>" });
			expect(mod.sendNotification).toHaveBeenCalledWith("SHOW_ALERT", expect.objectContaining({
				title: "Iepirkumi: atzīmēts", message: "<b>Piens</b>", messageType: "text"
			}));
		});

		it("TODOLIST_PHONE_LINK saglabā adresi QR kodam", () => {
			mod.updateDom = vi.fn();
			mod.socketNotificationReceived("TODOLIST_PHONE_LINK", { url: "http://pi:8080/todo", qrSvg: "<svg/>" });
			expect(mod.phoneLink.url).toBe("http://pi:8080/todo");
		});
	});

	it("TODO_ADD pārsūta tekstu uz node_helper", () => {
		mod.notificationReceived("TODO_ADD", { list: "shopping", text: "maizi" });
		expect(mod.sendSocketNotification).toHaveBeenCalledWith("TODOLIST_ADD", { list: "shopping", text: "maizi" });
	});

	describe("buildColumn", () => {
		it("tukšam sarakstam parāda tukšuma tekstu", () => {
			mod.loaded = true;
			const col = mod.buildColumn("Uzdevumi", [], "fa-list-check", "Nav neviena uzdevuma");
			const list = col.children[1];
			expect(list.children).toHaveLength(1);
			expect(list.children[0].className).toBe("td-empty");
			expect(list.children[0].innerText).toBe("Nav neviena uzdevuma");
		});

		it("apgriež pēc maxItems un parāda atlikušo skaitu", () => {
			mod.config.maxItems = 2;
			const items = [
				{ id: "1", content: "A" },
				{ id: "2", content: "B" },
				{ id: "3", content: "C" }
			];
			const col = mod.buildColumn("Uzdevumi", items, "fa-list-check");
			const list = col.children[1];
			expect(list.children).toHaveLength(3); // 2 ieraksti + "+1 vēl"
			expect(list.children[2].className).toBe("td-more");
			expect(list.children[2].innerText).toBe("+1 vēl");
		});
	});
});
