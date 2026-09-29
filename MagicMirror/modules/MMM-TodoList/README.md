# MMM-TodoList

Spoguļa paša **uzdevumu** un **iepirkumu** saraksts — bez ārēja servisa,
konta vai API atslēgas. Spogulī redzamas divas kolonnas; sarakstu labo
telefonā vai ar balsi, un izmaiņas spogulī parādās uzreiz.

## Kā lietot

- **Telefonā:** `http://<pi-ip>:8080/todo` — noskenē QR kodu saraksta lapā
  spogulī vai tālvadībā (`/remote.html`) spied **Saraksti**. Tur var
  pievienot, atzīmēt kā izdarītu, labot (pieskaries tekstam), pārkārtot
  (↑ ↓) un dzēst. Atzīmētie ieraksti paliek sadaļā "Atzīmētie" (var atjaunot)
  un pēc nedēļas izdzēšas paši.
- **Ar balsi** ("Spoguli, …", skat. MMM-VoiceCommands):
  - "parādi uzdevumus" / "iepirkumu saraksts" — pāriet uz šo lapu
  - **"nopirku pienu"** — atzīmē iepirkumu sarakstā ierakstu, kas vislabāk
    sakrīt ar teikto ("pienu" ≈ "Piens": locījumi un nelielas atpazīšanas
    kļūdas netraucē). Ja iepirkumos nav, meklē uzdevumos.
  - **"izdarīju veļu"** / "atzīmē …" — tas pats, sākot ar uzdevumiem
  - **"pievieno iepirkumiem maizi"** / "pievieno maizi" — jauns iepirkums;
    "pievieno uzdevumu …" — jauns uzdevums
  - "uzdevums pabeigts" / "pirkums nopirkts" (bez nosaukuma) — atzīmē
    sarakstā **augšējo** ierakstu

  Pēc katras balss darbības spogulis īsi parāda paziņojumu ("Iepirkumi:
  atzīmēts — Piens" vai "Sarakstā nav atrasts: …").

> Telefona lapa strādā tikai mājas tīklā (MagicMirror `ipWhitelist` —
> lokālās adreses), tāpēc ārpus mājām sarakstu labot nevar.

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
| `header` | `"Saraksti"` | Lapas virsraksts |
| `tasksHeader` | `"Uzdevumi"` | Kolonnas virsraksts |
| `shoppingHeader` | `"Iepirkumi"` | Kolonnas virsraksts |
| `maxItems` | `10` | Cik ierakstus rādīt katrā kolonnā (pārējie — "+N vēl") |
| `showPhoneLink` | `true` | QR kods un adrese uz telefona lapu |
| `showFeedback` | `true` | Īss paziņojums pēc balss darbības |

Kā atsevišķa MMM-Pages lapa: `pages: [ …, ["MMM-TodoList"] ]` (šajā projektā — lapa 7).

Poga tālvadībā — `config/custom_menu.json`:

```json
{ "id": "todo", "type": "link", "icon": "list-ul", "text": "Saraksti", "url": "todo" }
```

## Dati

SQLite datubāze `MagicMirror/data/todo.db` (iebūvētais `node:sqlite`, bez
papildu atkarībām) — ārpus `modules/`, jo to MagicMirror atdod pa HTTP.
Viena tabula `todo_items`:

| Lauks | Nozīme |
|---|---|
| `id` | Ieraksta numurs |
| `list` | `tasks` (uzdevumi) vai `shopping` (iepirkumi) |
| `content` | Teksts (līdz 200 zīmēm) |
| `position` | Secība sarakstā |
| `done`, `done_at` | Atzīmēts kā izdarīts un kad |
| `created_at` | Kad pievienots |

Visa loģika ir `node_helper.js` (nevis pārlūkā), tāpēc visi klienti (TV,
MacBook balss klausītājs, telefons) redz vienu un to pašu sarakstu, un
balss komanda, kas nonāk pie vairākiem klientiem, izpildās vienreiz.

## HTTP API (telefona lapai)

`GET /todo/api/state`, `POST /todo/api/{add,done,rename,delete,move,clear-done}`
ar JSON ķermeni (`{ list, content }`, `{ id, done }`, `{ id, content }`,
`{ id }`, `{ id, direction: -1|1 }`, `{ list }`). POST pieņem tikai
`Content-Type: application/json`.
