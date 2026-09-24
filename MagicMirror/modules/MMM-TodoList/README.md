# MMM-TodoList

Divas kolonnas — dienas **uzdevumi** un **iepirkumu saraksts** — no
[Todoist](https://todoist.com), lasītas ar Todoist REST API. Ieraksti,
pievienošana un dzēšana notiek pašā Todoist lietotnē telefonā (vai
jebkurā Todoist klientā); spogulis tos tikai rāda un ļauj pabeigt ar
balsi.

## Sagatavošana

1. Todoist kontā izveido divus projektus, piem. **Uzdevumi** un
   **Iepirkumi** (nosaukumus var mainīt konfigurācijā).
2. Todoist iestatījumos → *Integrations* → *Developer* nokopē savu
   **API token**.
3. Ieraksti to failā `MagicMirror/secrets.js` (nevis `config/secrets.js` —
   skat. `secrets.js.sample` par to, kāpēc):

```js
module.exports = {
	// ...
	todoist: {
		apiToken: "TAVS_TODOIST_API_TOKEN"
	}
};
```

## Konfigurācija

```js
{
	module: "MMM-TodoList",
	position: "middle_center",
	config: {}
}
```

| Opcija | Noklusējums | Apraksts |
|---|---|---|
| `updateInterval` | `60000` | Cik bieži (ms) vaicāt Todoist (min. 15000) |
| `tasksProjectName` | `"Uzdevumi"` | Todoist projekta nosaukums uzdevumiem |
| `shoppingProjectName` | `"Iepirkumi"` | Todoist projekta nosaukums pirkumu sarakstam |
| `tasksHeader` | `"Uzdevumi"` | Virsraksts uz ekrāna |
| `shoppingHeader` | `"Iepirkumi"` | Virsraksts uz ekrāna |
| `maxItems` | `8` | Cik ierakstus rādīt katrā kolonnā |

## Lapu pārslēdzējs (MMM-Pages)

```js
{
	module: "MMM-Pages",
	config: {
		pages: [
			// ...
			["MMM-TodoList"]
		]
	}
}
```

## Balss komandas

`MMM-VoiceCommands` noklusējumā jau satur:

- "parādi uzdevumus" / "uzdevumu saraksts" — pāriet uz šo lapu
- "uzdevums pabeigts" / "pabeidzu uzdevumu" / "izdarīju uzdevumu" —
  pabeidz **vecāko** (augšējo) nepabeigto uzdevumu
- "pirkums nopirkts" / "nopirku pirkumu" / "atzīmē pirkumu" — pabeidz
  **vecāko** iepirkumu sarakstā

Tā kā runas atpazīšana nezina konkrētā ieraksta nosaukumu vārds pa
vārdam, komandas vienmēr pabeidz sarakstā augšējo (Todoist noklusējuma
kārtībā) ierakstu — tāpēc ērtāk strādā, ja svarīgākais/steidzamākais
ieraksts katrā projektā tiek turēts saraksta augšā (Todoist ļauj
pārkārtot ar vilkšanu).

## Piezīmes

- Ja projekts ar norādīto nosaukumu Todoist kontā nav atrasts, modulis
  logā (konsolē) parāda kļūdu un turpina mēģināt nākamajā `updateInterval`.
- Projektu ID tiek noskaidrots vienreiz pēc nosaukuma un kešots, tāpēc
  projekta pārsaukšana Todoist prasīs MagicMirror restartu.
