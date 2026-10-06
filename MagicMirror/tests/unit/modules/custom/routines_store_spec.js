/* Vienībtesti MMM-Routines datubāzes atiestatīšanai (izrakstīšanās, lapa /signout). */
const path = require("node:path");

const { RoutinesStore } = require(path.resolve(__dirname, "../../../../modules/MMM-Routines/db.js"));

describe("MMM-Routines RoutinesStore.reset", () => {
	let store;

	beforeEach(() => {
		store = new RoutinesStore(":memory:");
	});

	afterEach(() => store.close());

	it("dzēš izvēles, treniņus un vēsturi, līmenis atpakaļ uz 1", () => {
		store.savePrefs({ targets: ["legs"], equipment: ["mat"] });
		store.saveLevel(4);
		store.saveLastPromptAt(123);
		const workout = {
			id: "w1", date: "2026-09-30", generatedAt: 1, level: 4, sets: 3, restSeconds: 60,
			status: "done", completedAt: 2, feedback: "ok",
			targets: ["legs"], equipment: ["mat"],
			exercises: [{ id: "squat", name: "Pietupieni", kind: "reps", amount: 10, perSide: false, detail: "" }]
		};
		store.insertWorkout(workout);
		store.addHistory("w1", { date: "2026-09-30", level: 4, feedback: "ok" });

		store.reset();

		const state = store.load();
		expect(state.prefs).toEqual({ targets: [], equipment: [] });
		expect(state.level).toBe(1);
		expect(state.lastPromptAt).toBe(0);
		expect(state.workout).toBeNull();
		expect(state.history).toEqual([]);
		expect(store.isEmpty()).toBe(true);
	});
});
