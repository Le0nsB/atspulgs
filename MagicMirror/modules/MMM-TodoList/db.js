/* SQLite glabātuve priekš MMM-TodoList (iebūvētais node:sqlite — bez native atkarībām).
 *
 * Viena tabula `todo_items`: abi saraksti ("tasks" — uzdevumi, "shopping" —
 * iepirkumi) kopā, `position` nosaka secību sarakstā. Atzīmētie ieraksti
 * paliek ar `done = 1` (lai telefonā var atsaukt nejaušu atzīmi) un tiek
 * dzēsti pēc DONE_KEEP_MS. Laiki ir Unix ms (Date.now()).
 */
const { DatabaseSync } = require("node:sqlite");

const LISTS = ["tasks", "shopping"];
const MAX_LENGTH = 200;
const DONE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS todo_items (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	list        TEXT NOT NULL CHECK (list IN ('tasks', 'shopping')),
	content     TEXT NOT NULL,
	position    INTEGER NOT NULL,
	done        INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
	created_at  INTEGER NOT NULL,
	done_at     INTEGER
);
CREATE INDEX IF NOT EXISTS todo_items_list ON todo_items (list, done, position);
`;

const toItem = (r) => ({ id: r.id, list: r.list, content: r.content, done: Boolean(r.done), createdAt: r.created_at, doneAt: r.done_at });

class TodoStore {
	constructor (file) {
		this.db = new DatabaseSync(file);
		this.db.exec("PRAGMA journal_mode = WAL;");
		this.db.exec(SCHEMA);
	}

	close () {
		this.db.close();
	}

	static checkList (list) {
		if (!LISTS.includes(list)) throw new Error("Nezināms saraksts.");
		return list;
	}

	static cleanContent (content) {
		const text = String(content ?? "").replace(/\s+/g, " ").trim();
		if (!text) throw new Error("Ieraksti, ko pievienot.");
		if (text.length > MAX_LENGTH) throw new Error("Teksts ir par garu.");
		return text;
	}

	get (id) {
		const r = this.db.prepare("SELECT * FROM todo_items WHERE id = ?").get(Number(id));
		return r ? toItem(r) : null;
	}

	// Nepabeigtie ieraksti sarakstā secībā (augšējais pirmais).
	open (list) {
		return this.db.prepare("SELECT * FROM todo_items WHERE list = ? AND done = 0 ORDER BY position, id").all(TodoStore.checkList(list)).map(toItem);
	}

	// Nesen atzīmētie (jaunākie pirmie) — telefonā, lai var atsaukt.
	done (list, limit = 30) {
		return this.db.prepare("SELECT * FROM todo_items WHERE list = ? AND done = 1 ORDER BY done_at DESC, id DESC LIMIT ?").all(TodoStore.checkList(list), limit).map(toItem);
	}

	// Jauns ieraksts saraksta beigās. Ja tieši tāds pats nepabeigts jau ir, to
	// neatkārto (piem. "pievieno pienu" divreiz vai no diviem klientiem).
	add (list, content, now = Date.now()) {
		TodoStore.checkList(list);
		const text = TodoStore.cleanContent(content);
		const existing = this.db.prepare("SELECT * FROM todo_items WHERE list = ? AND done = 0 AND lower(content) = lower(?)").get(list, text);
		if (existing) return { item: toItem(existing), added: false };
		const { next } = this.db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM todo_items WHERE list = ?").get(list);
		const { lastInsertRowid } = this.db.prepare("INSERT INTO todo_items (list, content, position, created_at) VALUES (?, ?, ?, ?)").run(list, text, next, now);
		return { item: this.get(lastInsertRowid), added: true };
	}

	setDone (id, done, now = Date.now()) {
		const item = this.get(id);
		if (!item) throw new Error("Ieraksts nav atrasts.");
		if (done) {
			this.db.prepare("UPDATE todo_items SET done = 1, done_at = ? WHERE id = ?").run(now, item.id);
		} else {
			// Atjaunotais ieraksts atgriežas saraksta beigās.
			const { next } = this.db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM todo_items WHERE list = ?").get(item.list);
			this.db.prepare("UPDATE todo_items SET done = 0, done_at = NULL, position = ? WHERE id = ?").run(next, item.id);
		}
		return this.get(item.id);
	}

	rename (id, content) {
		const item = this.get(id);
		if (!item) throw new Error("Ieraksts nav atrasts.");
		this.db.prepare("UPDATE todo_items SET content = ? WHERE id = ?").run(TodoStore.cleanContent(content), item.id);
		return this.get(item.id);
	}

	remove (id) {
		return this.db.prepare("DELETE FROM todo_items WHERE id = ?").run(Number(id)).changes > 0;
	}

	// Pārbīda nepabeigtu ierakstu par vienu vietu uz augšu (-1) vai leju (+1).
	move (id, direction) {
		const item = this.get(id);
		if (!item || item.done) throw new Error("Ieraksts nav atrasts.");
		const items = this.open(item.list);
		const i = items.findIndex((x) => x.id === item.id);
		const j = i + (direction < 0 ? -1 : 1);
		if (j < 0 || j >= items.length) return false;
		[items[i], items[j]] = [items[j], items[i]];
		const update = this.db.prepare("UPDATE todo_items SET position = ? WHERE id = ?");
		this.db.exec("BEGIN");
		try {
			items.forEach((x, k) => update.run(k + 1, x.id));
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
		return true;
	}

	clearDone (list) {
		return this.db.prepare("DELETE FROM todo_items WHERE list = ? AND done = 1").run(TodoStore.checkList(list)).changes;
	}

	purgeOldDone (now = Date.now()) {
		return this.db.prepare("DELETE FROM todo_items WHERE done = 1 AND done_at < ?").run(now - DONE_KEEP_MS).changes;
	}
}

module.exports = { TodoStore, LISTS, MAX_LENGTH, DONE_KEEP_MS };
