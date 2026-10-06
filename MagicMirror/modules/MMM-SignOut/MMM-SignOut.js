/* MagicMirror² Module: MMM-SignOut
 *
 * Izrakstīšanās no spoguļa, lai to varētu pārņemt cits cilvēks. Uz ekrāna nekā
 * nav — viss notiek telefona lapā http://<pi-ip>:8080/signout (poga
 * "Izrakstīties" tālvadībā), ko apkalpo node_helper.js.
 */
Module.register("MMM-SignOut", {
	getDom () {
		const wrapper = document.createElement("div");
		wrapper.style.display = "none";
		return wrapper;
	}
});
