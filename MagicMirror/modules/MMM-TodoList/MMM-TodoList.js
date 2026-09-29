/* MagicMirror² Module: MMM-TodoList
 *
 * Divas kolonnas — "Uzdevumi" un "Iepirkumi" — no paša spoguļa saraksta
 * (node_helper, SQLite data/todo.db). Ierakstus pievieno un maina telefonā
 * (http://<pi-ip>:8080/todo — QR kods šajā lapā, poga "Saraksti" tālvadībā)
 * vai ar balsi; izmaiņas parādās uzreiz.
 *
 * Balss komandas (skat. MMM-VoiceCommands):
 *   • TODO_COMPLETE { list }        — "uzdevums pabeigts" / "pirkums nopirkts":
 *     atzīmē augšējo ierakstu attiecīgajā sarakstā;
 *   • TODO_COMPLETE { list, text }  — "nopirku pienu" / "izdarīju veļu":
 *     atzīmē ierakstu, kura nosaukums vislabāk sakrīt ar teikto;
 *   • TODO_ADD { list, text }       — "pievieno iepirkumiem maizi".
 * Rezultātu īsi parāda `alert` modulis (SHOW_ALERT).
 */
Module.register("MMM-TodoList", {
	defaults: {
		header: "Saraksti",
		tasksHeader: "Uzdevumi",
		shoppingHeader: "Iepirkumi",
		maxItems: 10,
		showPhoneLink: true, // QR kods + adrese saraksta labošanai no telefona
		showFeedback: true // īss paziņojums (alert modulis) pēc balss darbības
	},

	getStyles () {
		return ["font-awesome.css", "MMM-TodoList.css"];
	},

	start () {
		this.tasks = [];
		this.shopping = [];
		this.loaded = false;
		this.phoneLink = null; // { url, qrSvg }
		this.sendSocketNotification("TODOLIST_CONFIG", {});
	},

	notificationReceived (notification, payload) {
		if (!payload || !payload.list) return;
		if (notification === "TODO_COMPLETE") {
			this.sendSocketNotification("TODOLIST_COMPLETE", { list: payload.list, text: payload.text || "" });
		} else if (notification === "TODO_ADD" && payload.text) {
			this.sendSocketNotification("TODOLIST_ADD", { list: payload.list, text: payload.text });
		}
	},

	listLabel (list) {
		return list === "shopping" ? this.config.shoppingHeader : this.config.tasksHeader;
	},

	feedback (title, message) {
		if (!this.config.showFeedback) return;
		this.sendNotification("SHOW_ALERT", { type: "notification", title, titleType: "text", message, messageType: "text", timer: 4000 });
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "TODOLIST_DATA") {
			this.loaded = true;
			this.tasks = payload.tasks || [];
			this.shopping = payload.shopping || [];
			this.updateDom(300);
		} else if (notification === "TODOLIST_PHONE_LINK" && payload && payload.url) {
			this.phoneLink = payload;
			this.updateDom();
		} else if (notification === "TODOLIST_DONE") {
			this.feedback(`${this.listLabel(payload.list)}: atzīmēts`, payload.content);
		} else if (notification === "TODOLIST_ADDED") {
			this.feedback(`${this.listLabel(payload.list)}: pievienots`, payload.content);
		} else if (notification === "TODOLIST_NOT_FOUND") {
			this.feedback(this.listLabel(payload.list), payload.text ? `Sarakstā nav atrasts: „${payload.text}"` : "Saraksts ir tukšs");
		}
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-todolist";

		const title = document.createElement("div");
		title.className = "td-title";
		title.innerText = this.config.header;
		wrapper.appendChild(title);

		const columns = document.createElement("div");
		columns.className = "td-columns";
		columns.appendChild(this.buildColumn(this.config.tasksHeader, this.tasks, "fa-list-check", "Nav neviena uzdevuma"));
		columns.appendChild(this.buildColumn(this.config.shoppingHeader, this.shopping, "fa-cart-shopping", "Nekas nav jāpērk"));
		wrapper.appendChild(columns);

		if (this.config.showPhoneLink && this.phoneLink) wrapper.appendChild(this.buildPhoneLink());
		return wrapper;
	},

	buildColumn (header, items, icon, emptyText) {
		const col = document.createElement("div");
		col.className = "td-column";

		const h = document.createElement("div");
		h.className = "td-header";
		h.innerHTML = `<i class="fa ${icon}"></i> `;
		h.appendChild(document.createTextNode(header));
		col.appendChild(h);

		const list = document.createElement("ul");
		list.className = "td-list";

		if (!items.length) {
			const empty = document.createElement("li");
			empty.className = "td-empty";
			empty.innerText = this.loaded ? emptyText : "Ielādē…";
			list.appendChild(empty);
		} else {
			items.slice(0, this.config.maxItems).forEach((item) => {
				list.appendChild(this.buildItem(item));
			});
			if (items.length > this.config.maxItems) {
				const more = document.createElement("li");
				more.className = "td-more";
				more.innerText = `+${items.length - this.config.maxItems} vēl`;
				list.appendChild(more);
			}
		}

		col.appendChild(list);
		return col;
	},

	buildItem (item) {
		const li = document.createElement("li");
		li.className = "td-item";

		const box = document.createElement("span");
		box.className = "td-check";
		box.innerHTML = "<i class=\"fa fa-square-o\"></i>";
		li.appendChild(box);

		const text = document.createElement("span");
		text.className = "td-text";
		text.innerText = item.content;
		li.appendChild(text);

		return li;
	},

	// QR kods (SVG, ko uzģenerē serveris no mūsu pašu adreses) + adrese teksta veidā.
	buildPhoneLink () {
		const box = document.createElement("div");
		box.className = "td-phone";
		if (this.phoneLink.qrSvg) {
			const qr = document.createElement("div");
			qr.className = "td-phone-qr";
			qr.innerHTML = this.phoneLink.qrSvg;
			box.appendChild(qr);
		}
		const text = document.createElement("div");
		const title = document.createElement("div");
		title.className = "td-phone-title";
		title.innerText = "Labo sarakstu no telefona";
		text.appendChild(title);
		const hint = document.createElement("div");
		hint.className = "td-phone-hint";
		hint.innerText = this.phoneLink.qrSvg ? `Noskenē kodu vai atver ${this.phoneLink.url}` : `Atver ${this.phoneLink.url}`;
		text.appendChild(hint);
		box.appendChild(text);
		return box;
	}
});
