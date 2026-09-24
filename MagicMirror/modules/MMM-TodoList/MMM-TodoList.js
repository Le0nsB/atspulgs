/* MagicMirror² Module: MMM-TodoList
 *
 * Divas kolonnas — "Uzdevumi" un "Iepirkumi" — ar nepabeigtajiem ierakstiem
 * no diviem Todoist projektiem. Dati un darbības (pabeigšana) iet caur
 * node_helper (Todoist REST API, token no MagicMirror/secrets.js).
 *
 * Balss komanda "uzdevums pabeigts" / "pirkums nopirkts" (skat.
 * MMM-VoiceCommands) nosūta TODO_COMPLETE ar { list: "tasks"|"shopping" },
 * kas šeit tiek pārsūtīts uz node_helper — pabeidz VECĀKO (augšējo)
 * nepabeigto ierakstu attiecīgajā sarakstā, jo balsij nav ērti pateikt
 * konkrētu Todoist ieraksta nosaukumu vārds pa vārdam.
 */
Module.register("MMM-TodoList", {
	defaults: {
		updateInterval: 60 * 1000,
		tasksProjectName: "Uzdevumi",
		shoppingProjectName: "Iepirkumi",
		tasksHeader: "Uzdevumi",
		shoppingHeader: "Iepirkumi",
		maxItems: 8
	},

	getStyles () {
		return ["font-awesome.css", "MMM-TodoList.css"];
	},

	start () {
		this.tasks = [];
		this.shopping = [];
		this.hasError = false;
		this.sendSocketNotification("TODOLIST_CONFIG", this.config);
	},

	notificationReceived (notification, payload) {
		if (notification === "TODO_COMPLETE" && payload && payload.list) {
			this.sendSocketNotification("TODOLIST_COMPLETE", { list: payload.list });
		}
	},

	socketNotificationReceived (notification, payload) {
		if (notification === "TODOLIST_NO_CREDENTIALS") {
			this.hasError = "config";
			this.updateDom();
		} else if (notification === "TODOLIST_DATA") {
			this.hasError = false;
			this.tasks = payload.tasks || [];
			this.shopping = payload.shopping || [];
			this.updateDom(300);
		} else if (notification === "TODOLIST_ERROR") {
			this.hasError = payload || true;
			this.updateDom(300);
		}
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-todolist";

		if (this.hasError === "config") {
			wrapper.className += " td-config-error";
			wrapper.innerText = "MMM-TodoList: nav iestatīts Todoist apiToken (secrets.js) — skat. moduļa README.md";
			return wrapper;
		}

		const columns = document.createElement("div");
		columns.className = "td-columns";
		columns.appendChild(this.buildColumn(this.config.tasksHeader, this.tasks, "fa-list-check"));
		columns.appendChild(this.buildColumn(this.config.shoppingHeader, this.shopping, "fa-cart-shopping"));
		wrapper.appendChild(columns);

		if (this.hasError) {
			const err = document.createElement("div");
			err.className = "td-error-note";
			err.innerText = "Todoist nav sasniedzams";
			wrapper.appendChild(err);
		}

		return wrapper;
	},

	buildColumn (header, items, icon) {
		const col = document.createElement("div");
		col.className = "td-column";

		const h = document.createElement("div");
		h.className = "td-header";
		h.innerHTML = `<i class="fa ${icon}"></i> ${header}`;
		col.appendChild(h);

		const list = document.createElement("ul");
		list.className = "td-list";

		if (!items.length) {
			const empty = document.createElement("li");
			empty.className = "td-empty";
			empty.innerText = "Nekā nav";
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

		if (item.due) {
			const due = document.createElement("span");
			due.className = "td-due";
			due.innerText = item.due;
			li.appendChild(due);
		}

		return li;
	}
});
