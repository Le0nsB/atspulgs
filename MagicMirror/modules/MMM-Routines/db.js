/* SQLite glabātuve priekš MMM-Routines (iebūvētais node:sqlite — bez native atkarībām).
 *
 * Tabulas atbilst ER diagrammai:
 *   user_state        — viena rinda: līmenis, pēdējā jautājuma laiks, pašreizējais treniņš
 *   user_targets      — izvēlētās ķermeņa daļas
 *   user_equipment    — pieejamais inventārs
 *   workouts          — visi uzģenerētie treniņi
 *   workout_targets / workout_equipment / workout_exercises — treniņa saturs
 *   history           — pabeigtie treniņi ar atbildi (līdz HISTORY_LIMIT)
 *
 * Vingrinājumu, ķermeņa daļu un inventāra katalogs paliek statisks (exercises.js),
 * tāpēc tā id šeit nav ar FK — tos pārbauda cleanIds pirms saglabāšanas.
 * Laiki ir Unix ms (Date.now()), datumi — teksts YYYY-MM-DD.
 */
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workouts (
	id            TEXT PRIMARY KEY,
	date          TEXT NOT NULL,
	generated_at  INTEGER NOT NULL,
	level         INTEGER NOT NULL,
	sets          INTEGER NOT NULL,
	rest_seconds  INTEGER NOT NULL,
	status        TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_feedback', 'done')),
	completed_at  INTEGER,
	feedback      TEXT CHECK (feedback IN ('easy', 'ok', 'hard'))
);
CREATE TABLE IF NOT EXISTS workout_targets (
	workout_id  TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
	position    INTEGER NOT NULL,
	target_id   TEXT NOT NULL,
	PRIMARY KEY (workout_id, position)
);
CREATE TABLE IF NOT EXISTS workout_equipment (
	workout_id    TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
	position      INTEGER NOT NULL,
	equipment_id  TEXT NOT NULL,
	PRIMARY KEY (workout_id, position)
);
CREATE TABLE IF NOT EXISTS workout_exercises (
	workout_id   TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
	position     INTEGER NOT NULL,
	exercise_id  TEXT NOT NULL,
	name         TEXT NOT NULL,
	kind         TEXT NOT NULL CHECK (kind IN ('reps', 'time')),
	amount       INTEGER NOT NULL,
	per_side     INTEGER NOT NULL,
	detail       TEXT NOT NULL,
	PRIMARY KEY (workout_id, position)
);
CREATE TABLE IF NOT EXISTS user_state (
	id                  INTEGER PRIMARY KEY CHECK (id = 1),
	level               INTEGER NOT NULL DEFAULT 1,
	last_prompt_at      INTEGER NOT NULL DEFAULT 0,
	current_workout_id  TEXT REFERENCES workouts(id)
);
CREATE TABLE IF NOT EXISTS user_targets (
	position   INTEGER PRIMARY KEY,
	target_id  TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS user_equipment (
	position      INTEGER PRIMARY KEY,
	equipment_id  TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS history (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	workout_id  TEXT NOT NULL REFERENCES workouts(id),
	date        TEXT NOT NULL,
	level       INTEGER NOT NULL,
	feedback    TEXT CHECK (feedback IN ('easy', 'ok', 'hard'))
);
INSERT OR IGNORE INTO user_state (id) VALUES (1);
`;

class RoutinesStore {
	constructor (file, { historyLimit = 90 } = {}) {
		this.historyLimit = historyLimit;
		this.db = new DatabaseSync(file);
		this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
		this.db.exec(SCHEMA);
	}

	close () {
		this.db.close();
	}

	// Visu izmaiņu vai nekā: ja kāds INSERT izgāžas, datubāze paliek kā bija.
	// Iekšējs tx (piem., savePrefs no importJson) vienkārši pievienojas ārējam.
	tx (fn) {
		if (this.db.isTransaction) return fn();
		this.db.exec("BEGIN");
		try {
			const result = fn();
			this.db.exec("COMMIT");
			return result;
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	isEmpty () {
		const s = this.db.prepare("SELECT current_workout_id, last_prompt_at FROM user_state WHERE id = 1").get();
		const prefs = this.db.prepare("SELECT COUNT(*) AS n FROM user_targets").get().n;
		return !s.current_workout_id && !s.last_prompt_at && !prefs;
	}

	/* ------------------------- lasīšana ------------------------- */

	// Atgriež to pašu formu, ko node_helper glabā atmiņā (un agrāk — data.json).
	load () {
		const s = this.db.prepare("SELECT level, last_prompt_at, current_workout_id FROM user_state WHERE id = 1").get();
		return {
			prefs: {
				targets: this.db.prepare("SELECT target_id FROM user_targets ORDER BY position").all().map((r) => r.target_id),
				equipment: this.db.prepare("SELECT equipment_id FROM user_equipment ORDER BY position").all().map((r) => r.equipment_id)
			},
			level: s.level,
			lastPromptAt: s.last_prompt_at,
			workout: s.current_workout_id ? this.getWorkout(s.current_workout_id) : null,
			history: this.getHistory()
		};
	}

	getWorkout (id) {
		const w = this.db.prepare("SELECT * FROM workouts WHERE id = ?").get(id);
		if (!w) return null;
		return {
			id: w.id,
			date: w.date,
			generatedAt: w.generated_at,
			targets: this.db.prepare("SELECT target_id FROM workout_targets WHERE workout_id = ? ORDER BY position").all(id).map((r) => r.target_id),
			equipment: this.db.prepare("SELECT equipment_id FROM workout_equipment WHERE workout_id = ? ORDER BY position").all(id).map((r) => r.equipment_id),
			level: w.level,
			sets: w.sets,
			restSeconds: w.rest_seconds,
			exercises: this.db.prepare("SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY position").all(id).map((e) => ({
				id: e.exercise_id,
				name: e.name,
				kind: e.kind,
				amount: e.amount,
				perSide: Boolean(e.per_side),
				detail: e.detail
			})),
			status: w.status,
			completedAt: w.completed_at,
			feedback: w.feedback
		};
	}

	getHistory () {
		const rows = this.db.prepare("SELECT workout_id, date, level, feedback FROM history ORDER BY id").all();
		const targets = this.db.prepare("SELECT target_id FROM workout_targets WHERE workout_id = ? ORDER BY position");
		return rows.map((h) => ({
			date: h.date,
			targets: targets.all(h.workout_id).map((r) => r.target_id),
			level: h.level,
			feedback: h.feedback
		}));
	}

	/* ------------------------- rakstīšana ------------------------- */

	savePrefs ({ targets, equipment }) {
		this.tx(() => {
			this.db.exec("DELETE FROM user_targets; DELETE FROM user_equipment;");
			const t = this.db.prepare("INSERT INTO user_targets (position, target_id) VALUES (?, ?)");
			targets.forEach((id, i) => t.run(i, id));
			const e = this.db.prepare("INSERT INTO user_equipment (position, equipment_id) VALUES (?, ?)");
			equipment.forEach((id, i) => e.run(i, id));
		});
	}

	saveLevel (level) {
		this.db.prepare("UPDATE user_state SET level = ? WHERE id = 1").run(level);
	}

	saveLastPromptAt (ms) {
		this.db.prepare("UPDATE user_state SET last_prompt_at = ? WHERE id = 1").run(ms);
	}

	// Jauns treniņš: ieraksta to ar visu saturu un padara par pašreizējo.
	insertWorkout (w) {
		this.tx(() => {
			this.db.prepare(`INSERT INTO workouts (id, date, generated_at, level, sets, rest_seconds, status, completed_at, feedback)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
				.run(w.id, w.date, w.generatedAt, w.level, w.sets, w.restSeconds, w.status, w.completedAt, w.feedback);
			const t = this.db.prepare("INSERT INTO workout_targets (workout_id, position, target_id) VALUES (?, ?, ?)");
			w.targets.forEach((id, i) => t.run(w.id, i, id));
			const eq = this.db.prepare("INSERT INTO workout_equipment (workout_id, position, equipment_id) VALUES (?, ?, ?)");
			w.equipment.forEach((id, i) => eq.run(w.id, i, id));
			const ex = this.db.prepare(`INSERT INTO workout_exercises (workout_id, position, exercise_id, name, kind, amount, per_side, detail)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
			w.exercises.forEach((e, i) => ex.run(w.id, i, e.id, e.name, e.kind, e.amount, e.perSide ? 1 : 0, e.detail));
			this.db.prepare("UPDATE user_state SET current_workout_id = ? WHERE id = 1").run(w.id);
		});
	}

	// Mainās tikai statuss (pending -> awaiting_feedback -> done), saturs paliek.
	updateWorkoutStatus (w) {
		this.db.prepare("UPDATE workouts SET status = ?, completed_at = ?, feedback = ? WHERE id = ?")
			.run(w.status, w.completedAt, w.feedback, w.id);
	}

	addHistory (workoutId, { date, level, feedback }) {
		this.tx(() => {
			this.db.prepare("INSERT INTO history (workout_id, date, level, feedback) VALUES (?, ?, ?, ?)").run(workoutId, date, level, feedback);
			this.db.prepare("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?)").run(this.historyLimit);
		});
	}

	// Izrakstīšanās (jauns lietotājs): dzēš izvēles, treniņus un vēsturi, līmenis atpakaļ uz 1.
	reset () {
		this.tx(() => {
			this.db.exec(`
				UPDATE user_state SET level = 1, last_prompt_at = 0, current_workout_id = NULL WHERE id = 1;
				DELETE FROM history;
				DELETE FROM workout_exercises; DELETE FROM workout_targets; DELETE FROM workout_equipment;
				DELETE FROM workouts;
				DELETE FROM user_targets; DELETE FROM user_equipment;
			`);
		});
	}

	/* ------------------------- migrācija ------------------------- */

	// Vienreiz pārnes veco data.json (ja datubāze vēl tukša) un pārvieto to uz `backupFile`.
	// Vēstures ierakstiem no JSON nav sava treniņa id, tāpēc tiem izveido "done" treniņu bez vingrinājumiem.
	importJson (file, backupFile = `${file}.migrated`) {
		if (!fs.existsSync(file) || !this.isEmpty()) return false;
		const data = JSON.parse(fs.readFileSync(file, "utf8"));
		this.tx(() => {
			const prefs = data.prefs || {};
			this.savePrefs({ targets: prefs.targets || [], equipment: prefs.equipment || [] });
			this.db.prepare("UPDATE user_state SET level = ?, last_prompt_at = ? WHERE id = 1").run(data.level ?? 1, data.lastPromptAt ?? 0);
			(data.history || []).forEach((h, i) => {
				const id = `hist-${h.date}-${i}`;
				this.db.prepare(`INSERT INTO workouts (id, date, generated_at, level, sets, rest_seconds, status, completed_at, feedback)
					VALUES (?, ?, 0, ?, 0, 0, 'done', NULL, ?)`).run(id, h.date, h.level, h.feedback ?? null);
				const t = this.db.prepare("INSERT INTO workout_targets (workout_id, position, target_id) VALUES (?, ?, ?)");
				(h.targets || []).forEach((tid, j) => t.run(id, j, tid));
				this.db.prepare("INSERT INTO history (workout_id, date, level, feedback) VALUES (?, ?, ?, ?)").run(id, h.date, h.level, h.feedback ?? null);
			});
			// Pēdējais, lai tas kļūst par pašreizējo treniņu.
			if (data.workout) this.insertWorkout(data.workout);
		});
		fs.renameSync(file, backupFile);
		return true;
	}
}

module.exports = { RoutinesStore };
