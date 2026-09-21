/* MMM-Routines — vingrinājumu datubāze un treniņu ģenerators.
 *
 * Tīrs Node kods bez atkarībām (nekādu API atslēgu, strādā bez interneta).
 * Ģenerators izvēlas vingrinājumus pēc trenējamām ķermeņa daļām, pieejamā
 * inventāra un pašreizējā līmeņa (1..MAX_LEVEL), ko pielāgo lietotāja atbildes
 * ("par vieglu" / "par grūtu") pēc katra treniņa.
 */

const MAX_LEVEL = 10;

const TARGETS = [
	{ id: "chest", label: "Krūtis" },
	{ id: "back", label: "Mugura" },
	{ id: "shoulders", label: "Pleci" },
	{ id: "arms", label: "Rokas" },
	{ id: "core", label: "Vēders / kodols" },
	{ id: "legs", label: "Kājas un sēžamvieta" },
	{ id: "full", label: "Viss ķermenis" }
];

// Bez inventāra ("ķermeņa svars") vienmēr ir pieejams, tāpēc te nav minēts.
const EQUIPMENT = [
	{ id: "dumbbell", label: "Hanteles" },
	{ id: "barbell", label: "Stienis ar svariem" },
	{ id: "pullup", label: "Pievilkšanās stienis" },
	{ id: "ball", label: "Jogas bumba" },
	{ id: "band", label: "Gumijas lente" },
	{ id: "kettlebell", label: "Svaru bumba (kettlebell)" },
	{ id: "bench", label: "Sols / stabils krēsls" }
];

// Vingrinājums: id, nosaukums, ķermeņa daļas, inventārs (kāds no saraksta; [] = bez
// inventāra), sarežģītības pakāpe 1..3, veids ("reps" vai "time"), bāzes atkārtojumi/
// sekundes (1. līmenī), vai katrā pusē atsevišķi.
const E = (id, name, groups, eq, tier, kind, base, perSide = false) => ({ id, name, groups, eq, tier, kind, base, perSide });

const EXERCISES = [
	// --- krūtis ---
	E("pushup-knee", "Atspiešanās no ceļiem", ["chest"], [], 1, "reps", 10),
	E("pushup", "Atspiešanās", ["chest"], [], 1, "reps", 8),
	E("pushup-incline", "Atspiešanās ar rokām uz sola", ["chest"], ["bench"], 1, "reps", 12),
	E("pushup-wide", "Platā atspiešanās", ["chest"], [], 2, "reps", 10),
	E("pushup-decline", "Atspiešanās ar kājām uz sola", ["chest", "shoulders"], ["bench"], 2, "reps", 10),
	E("pushup-diamond", "Dimanta atspiešanās", ["chest", "arms"], [], 3, "reps", 8),
	E("pushup-ball", "Atspiešanās ar rokām uz jogas bumbas", ["chest", "core"], ["ball"], 3, "reps", 8),
	E("db-floor-press", "Hanteļu spiešana guļus uz grīdas", ["chest"], ["dumbbell"], 1, "reps", 12),
	E("db-fly", "Hanteļu atvēršana guļus", ["chest"], ["dumbbell"], 2, "reps", 12),
	E("db-pullover", "Hanteļu pullover", ["chest", "back"], ["dumbbell"], 2, "reps", 12),
	E("bb-floor-press", "Stieņa spiešana guļus uz grīdas", ["chest", "arms"], ["barbell"], 2, "reps", 10),
	E("band-chest-press", "Lentes krūšu spiešana", ["chest"], ["band"], 1, "reps", 15),
	E("band-fly", "Lentes atvēršana krūšu priekšā", ["chest"], ["band"], 2, "reps", 15),
	E("palm-press", "Plaukstu spiešana krūšu priekšā", ["chest", "arms"], [], 1, "time", 20),

	// --- mugura ---
	E("superman", "Supermens (guļus uz vēdera)", ["back"], [], 1, "reps", 12),
	E("ytw", "Y-T-W pacelšanas guļus", ["back", "shoulders"], [], 1, "reps", 10),
	E("snow-angel", "Apgrieztais sniega eņģelis", ["back"], [], 1, "reps", 12),
	E("swimmers", "Peldētājs (guļus uz vēdera)", ["back"], [], 2, "reps", 20),
	E("bird-dog", "Bird-dog", ["back", "core"], [], 1, "reps", 10, true),
	E("wall-angel", "Sienas eņģeļi", ["back", "shoulders"], [], 1, "reps", 12),
	E("scapular-pushup", "Lāpstiņu atspiešanās plankā", ["back", "shoulders"], [], 1, "reps", 12),
	E("db-row-single", "Hanteles airēšana ar vienu roku", ["back"], ["dumbbell"], 1, "reps", 12, true),
	E("db-row-bent", "Hanteļu airēšana noliecoties", ["back"], ["dumbbell"], 1, "reps", 12),
	E("db-renegade-row", "Renegade airēšana ar hantelēm", ["back", "core"], ["dumbbell"], 3, "reps", 8, true),
	E("bb-row", "Stieņa airēšana noliecoties", ["back"], ["barbell"], 2, "reps", 10),
	E("bb-deadlift", "Stieņa vilkme", ["back", "legs"], ["barbell"], 2, "reps", 8),
	E("band-row", "Lentes airēšana sēdus", ["back"], ["band"], 1, "reps", 15),
	E("band-pull-apart", "Lentes izvēršana uz sāniem", ["back", "shoulders"], ["band"], 1, "reps", 15),
	E("ball-back-ext", "Muguras izstiepšana uz jogas bumbas", ["back"], ["ball"], 2, "reps", 12),
	E("pullup", "Pievilkšanās pie stieņa", ["back", "arms"], ["pullup"], 3, "reps", 6),
	E("chinup", "Pievilkšanās ar apakšķērienu", ["back", "arms"], ["pullup"], 2, "reps", 6),
	E("dead-hang", "Karāšanās pie stieņa", ["back", "arms"], ["pullup"], 1, "time", 20),

	// --- pleci ---
	E("pike-pushup", "Pike atspiešanās", ["shoulders"], [], 2, "reps", 8),
	E("pike-pushup-bench", "Pike atspiešanās ar kājām uz sola", ["shoulders"], ["bench"], 3, "reps", 8),
	E("db-press", "Hanteļu spiešana virs galvas", ["shoulders"], ["dumbbell"], 1, "reps", 10),
	E("db-arnold", "Arnolda spiešana", ["shoulders"], ["dumbbell"], 2, "reps", 10),
	E("db-lateral", "Hanteļu pacelšana sānis", ["shoulders"], ["dumbbell"], 1, "reps", 12),
	E("db-front", "Hanteļu pacelšana uz priekšu", ["shoulders"], ["dumbbell"], 1, "reps", 12),
	E("db-rear-fly", "Hanteļu atvēršana noliecoties", ["shoulders", "back"], ["dumbbell"], 1, "reps", 12),
	E("bb-ohp", "Stieņa spiešana stāvus", ["shoulders", "arms"], ["barbell"], 2, "reps", 8),
	E("band-lateral", "Lentes pacelšana sānis", ["shoulders"], ["band"], 1, "reps", 15),
	E("band-face-pull", "Lentes face pull", ["shoulders", "back"], ["band"], 1, "reps", 15),
	E("kb-halo", "Svaru bumbas aplis ap galvu", ["shoulders", "core"], ["kettlebell"], 2, "reps", 10),
	E("kb-press", "Svaru bumbas spiešana virs galvas", ["shoulders", "arms"], ["kettlebell"], 2, "reps", 8, true),
	E("arm-circles", "Roku apļi", ["shoulders"], [], 1, "time", 30),
	E("shoulder-taps", "Planka ar pieskārieniem plecam", ["shoulders", "core"], [], 2, "reps", 20),

	// --- rokas ---
	E("db-curl", "Hanteļu bicepsa cirtieni", ["arms"], ["dumbbell"], 1, "reps", 12),
	E("db-hammer", "Āmura cirtieni ar hantelēm", ["arms"], ["dumbbell"], 1, "reps", 12),
	E("db-concentration", "Koncentrētie bicepsa cirtieni", ["arms"], ["dumbbell"], 2, "reps", 10, true),
	E("bb-curl", "Stieņa bicepsa cirtieni", ["arms"], ["barbell"], 1, "reps", 12),
	E("band-curl", "Lentes bicepsa cirtieni", ["arms"], ["band"], 1, "reps", 15),
	E("bench-dips", "Tricepsa atspiešanās no sola", ["arms"], ["bench"], 1, "reps", 12),
	E("db-tri-ext", "Tricepsa pagarināšana virs galvas", ["arms"], ["dumbbell", "kettlebell"], 1, "reps", 12),
	E("db-kickback", "Tricepsa kickback ar hanteli", ["arms"], ["dumbbell"], 1, "reps", 12, true),
	E("band-pushdown", "Lentes tricepsa spiešana uz leju", ["arms"], ["band"], 1, "reps", 15),
	E("bb-skullcrusher", "Franču spiešana ar stieni guļus", ["arms"], ["barbell"], 2, "reps", 10),
	E("pushup-close", "Atspiešanās ar šauru satvērienu", ["arms", "chest"], [], 2, "reps", 10),
	E("table-dips", "Tricepsa atspiešanās no grīdas (galda poza)", ["arms"], [], 1, "reps", 10),
	E("self-curl", "Bicepsa cirtieni pret savu roku pretestību", ["arms"], [], 1, "time", 20, true),
	E("plank-updown", "Planka: uz elkoņiem un atpakaļ uz plaukstām", ["arms", "core", "full"], [], 2, "reps", 10),

	// --- vēders / kodols ---
	E("plank", "Planka", ["core"], [], 1, "time", 30),
	E("plank-side", "Sānu planka", ["core"], [], 2, "time", 20, true),
	E("crunch", "Vēdera presītes", ["core"], [], 1, "reps", 15),
	E("bicycle", "Velosipēds (vēdera presītes)", ["core"], [], 1, "reps", 20),
	E("leg-raise", "Kāju pacelšana guļus", ["core"], [], 2, "reps", 12),
	E("russian-twist", "Krievu grieziens", ["core"], [], 1, "reps", 20),
	E("russian-twist-db", "Krievu grieziens ar hanteli", ["core"], ["dumbbell"], 2, "reps", 20),
	E("dead-bug", "Dead bug", ["core"], [], 1, "reps", 10, true),
	E("mountain-climber", "Kalnu kāpēji", ["core", "full"], [], 2, "time", 30),
	E("boat-hold", "Laiviņa (V-sēdus turēšana)", ["core"], [], 2, "time", 20),
	E("hollow-hold", "Hollow hold", ["core"], [], 3, "time", 20),
	E("ball-plank", "Planka ar elkoņiem uz jogas bumbas", ["core"], ["ball"], 2, "time", 30),
	E("ball-crunch", "Vēdera presītes uz jogas bumbas", ["core"], ["ball"], 1, "reps", 15),
	E("ball-rollout", "Jogas bumbas rollout", ["core"], ["ball"], 3, "reps", 10),
	E("ball-pass", "Jogas bumbas pārnešana starp rokām un kājām", ["core"], ["ball"], 3, "reps", 10),
	E("band-pallof", "Pallof spiešana ar lenti", ["core"], ["band"], 2, "reps", 12, true),
	E("db-woodchop", "Malkas skaldīšana ar hanteli", ["core", "shoulders"], ["dumbbell"], 2, "reps", 12, true),
	E("hanging-knee-raise", "Ceļu pacelšana karājoties pie stieņa", ["core"], ["pullup"], 3, "reps", 10),

	// --- kājas un sēžamvieta ---
	E("squat", "Pietupieni", ["legs"], [], 1, "reps", 15),
	E("lunge", "Izklupieni uz priekšu", ["legs"], [], 1, "reps", 12, true),
	E("lunge-reverse-db", "Izklupieni atpakaļ ar hantelēm", ["legs"], ["dumbbell"], 2, "reps", 10, true),
	E("curtsy-lunge", "Reveranss (izklupiens ar kāju pāri)", ["legs"], [], 2, "reps", 10, true),
	E("split-squat-bulgarian", "Bulgāru pietupieni ar kāju uz sola", ["legs"], ["bench"], 2, "reps", 10, true),
	E("step-up", "Uzkāpšana uz sola", ["legs"], ["bench"], 1, "reps", 12, true),
	E("glute-bridge", "Gūžu pacelšana guļus", ["legs"], [], 1, "reps", 15),
	E("glute-bridge-single", "Gūžu pacelšana uz vienas kājas", ["legs"], [], 2, "reps", 10, true),
	E("goblet-squat", "Goblet pietupieni ar svaru", ["legs"], ["dumbbell", "kettlebell"], 1, "reps", 12),
	E("sumo-squat", "Sumo pietupieni ar svaru", ["legs"], ["dumbbell", "kettlebell"], 1, "reps", 12),
	E("db-rdl", "Rumāņu vilkme ar hantelēm", ["legs", "back"], ["dumbbell"], 2, "reps", 12),
	E("single-leg-rdl", "Rumāņu vilkme uz vienas kājas", ["legs"], [], 2, "reps", 8, true),
	E("bb-squat", "Pietupieni ar stieni uz pleciem", ["legs"], ["barbell"], 2, "reps", 10),
	E("jump-squat", "Lēcienu pietupieni", ["legs", "full"], [], 3, "reps", 12),
	E("jump-lunge", "Lēcienu izklupieni", ["legs", "full"], [], 3, "reps", 16),
	E("wall-sit", "Sēdēšana pret sienu", ["legs"], [], 1, "time", 30),
	E("ball-wall-squat", "Pietupieni ar jogas bumbu pret sienu", ["legs"], ["ball"], 1, "reps", 12),
	E("ball-hamstring-curl", "Kāju pievilkšana ar jogas bumbu guļus", ["legs"], ["ball"], 2, "reps", 10),
	E("calf-raise", "Pacelšanās uz pirkstgaliem", ["legs"], [], 1, "reps", 20),
	E("band-lateral-walk", "Soļi sāniski ar lenti ap ceļiem", ["legs"], ["band"], 1, "reps", 12, true),
	E("band-squat", "Pietupieni ar lenti", ["legs"], ["band"], 1, "reps", 15),

	// --- viss ķermenis ---
	E("burpee", "Burpiji", ["full"], [], 3, "reps", 10),
	E("jumping-jacks", "Zvaigžņu lēcieni", ["full"], [], 1, "time", 30),
	E("high-knees", "Skriešana vietā ar augstiem ceļiem", ["full"], [], 1, "time", 30),
	E("inchworm", "Tārpiņš (staigāšana ar rokām līdz plankai)", ["full"], [], 1, "reps", 8),
	E("bear-crawl", "Lāča rāpošana", ["full", "core"], [], 2, "time", 30),
	E("skater-hops", "Slēpotāja lēcieni sānis", ["full", "legs"], [], 2, "reps", 20),
	E("kb-swing", "Svaru bumbas šūpošana (swing)", ["full", "legs", "back"], ["kettlebell"], 2, "reps", 15),
	E("db-thruster", "Thruster ar hantelēm", ["full", "legs", "shoulders"], ["dumbbell"], 2, "reps", 10),
	E("db-clean-press", "Hanteļu clean & press", ["full"], ["dumbbell"], 3, "reps", 8),
	E("bb-clean-press", "Stieņa clean & press", ["full"], ["barbell"], 3, "reps", 6)
];

// Angliskie nosaukumi video meklēšanai — latviešu nosaukumiem YouTube gandrīz neko neatrod.
const SEARCH_NAMES = {
	"pushup-knee": "knee push up",
	"pushup": "push up",
	"pushup-incline": "incline push up",
	"pushup-wide": "wide push up",
	"pushup-decline": "decline push up",
	"pushup-diamond": "diamond push up",
	"pushup-ball": "push up with hands on stability ball",
	"db-floor-press": "dumbbell floor press",
	"db-fly": "dumbbell chest fly on floor",
	"db-pullover": "dumbbell pullover",
	"bb-floor-press": "barbell floor press",
	"band-chest-press": "resistance band chest press",
	"band-fly": "resistance band chest fly",
	"palm-press": "isometric palm press chest",
	"superman": "superman exercise back",
	"ytw": "prone Y T W raises",
	"snow-angel": "reverse snow angel",
	"swimmers": "swimmers exercise back",
	"bird-dog": "bird dog",
	"wall-angel": "wall angels",
	"scapular-pushup": "scapular push up",
	"db-row-single": "single arm dumbbell row",
	"db-row-bent": "bent over dumbbell row",
	"db-renegade-row": "renegade row",
	"bb-row": "bent over barbell row",
	"bb-deadlift": "barbell deadlift",
	"band-row": "seated resistance band row",
	"band-pull-apart": "resistance band pull apart",
	"ball-back-ext": "back extension on stability ball",
	"pullup": "pull up",
	"chinup": "chin up",
	"dead-hang": "dead hang",
	"pike-pushup": "pike push up",
	"pike-pushup-bench": "elevated pike push up",
	"db-press": "dumbbell shoulder press",
	"db-arnold": "arnold press",
	"db-lateral": "dumbbell lateral raise",
	"db-front": "dumbbell front raise",
	"db-rear-fly": "bent over dumbbell rear delt fly",
	"bb-ohp": "barbell overhead press",
	"band-lateral": "resistance band lateral raise",
	"band-face-pull": "resistance band face pull",
	"kb-halo": "kettlebell halo",
	"kb-press": "single arm kettlebell overhead press",
	"arm-circles": "arm circles",
	"shoulder-taps": "plank shoulder taps",
	"db-curl": "dumbbell bicep curl",
	"db-hammer": "hammer curl",
	"db-concentration": "concentration curl",
	"bb-curl": "barbell curl",
	"band-curl": "resistance band bicep curl",
	"bench-dips": "bench dips",
	"db-tri-ext": "overhead tricep extension",
	"db-kickback": "dumbbell tricep kickback",
	"band-pushdown": "resistance band tricep pushdown",
	"bb-skullcrusher": "barbell skull crusher",
	"pushup-close": "close grip push up",
	"table-dips": "tabletop tricep dips",
	"self-curl": "isometric self resistance bicep curl",
	"plank-updown": "plank up downs",
	"plank": "plank",
	"plank-side": "side plank",
	"crunch": "crunches",
	"bicycle": "bicycle crunches",
	"leg-raise": "lying leg raises",
	"russian-twist": "russian twist",
	"russian-twist-db": "russian twist with dumbbell",
	"dead-bug": "dead bug",
	"mountain-climber": "mountain climbers",
	"boat-hold": "boat pose hold abs",
	"hollow-hold": "hollow body hold",
	"ball-plank": "stability ball plank",
	"ball-crunch": "stability ball crunch",
	"ball-rollout": "stability ball rollout",
	"ball-pass": "stability ball pass hands to feet",
	"band-pallof": "pallof press",
	"db-woodchop": "dumbbell wood chop",
	"hanging-knee-raise": "hanging knee raises",
	"squat": "bodyweight squat",
	"lunge": "forward lunge",
	"lunge-reverse-db": "dumbbell reverse lunge",
	"curtsy-lunge": "curtsy lunge",
	"split-squat-bulgarian": "bulgarian split squat",
	"step-up": "step ups",
	"glute-bridge": "glute bridge",
	"glute-bridge-single": "single leg glute bridge",
	"goblet-squat": "goblet squat",
	"sumo-squat": "sumo squat with weight",
	"db-rdl": "dumbbell romanian deadlift",
	"single-leg-rdl": "single leg romanian deadlift",
	"bb-squat": "barbell back squat",
	"jump-squat": "jump squats",
	"jump-lunge": "jumping lunges",
	"wall-sit": "wall sit",
	"ball-wall-squat": "wall squat with stability ball",
	"ball-hamstring-curl": "stability ball hamstring curl",
	"calf-raise": "calf raises",
	"band-lateral-walk": "resistance band lateral walk",
	"band-squat": "resistance band squat",
	"burpee": "burpees",
	"jumping-jacks": "jumping jacks",
	"high-knees": "high knees",
	"inchworm": "inchworm exercise",
	"bear-crawl": "bear crawl",
	"skater-hops": "skater hops",
	"kb-swing": "kettlebell swing",
	"db-thruster": "dumbbell thruster",
	"db-clean-press": "dumbbell clean and press",
	"bb-clean-press": "barbell clean and press"
};

// Saite uz YouTube meklējumiem "kā izpildīt". Konkrēti video ID te nav iekodēti — tos nevar
// pārbaudīt, un mirušas saites būtu sliktākas par meklējumiem.
const videoUrlFor = (id) => {
	const name = SEARCH_NAMES[id];
	return name ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to do ${name} proper form`)}` : null;
};

// Demonstrācijas attēli: vingrinājuma id -> mape public/media/<mape>/ ar 0.jpg (sākuma poza) un
// 1.jpg (beigu poza). Avots: free-exercise-db (https://github.com/yuhonas/free-exercise-db,
// Unlicense / public domain), samazināti līdz 360 px. Ne visiem vingrinājumiem ir atbilstošs
// attēls — tikai droši sakritumi; pārējiem paliek saite uz YouTube meklējumiem.
const MEDIA = {
	"pushup": "Pushups",
	"pushup-incline": "Incline_Push-Up",
	"pushup-wide": "Push-Up_Wide",
	"pushup-decline": "Decline_Push-Up",
	"db-floor-press": "Dumbbell_Floor_Press",
	"db-fly": "Dumbbell_Flyes",
	"db-pullover": "Bent-Arm_Dumbbell_Pullover",
	"bb-floor-press": "Floor_Press",
	"palm-press": "Isometric_Chest_Squeezes",
	"superman": "Superman",
	"db-row-single": "One-Arm_Dumbbell_Row",
	"db-row-bent": "Bent_Over_Two-Dumbbell_Row",
	"db-renegade-row": "Alternating_Renegade_Row",
	"bb-row": "Bent_Over_Barbell_Row",
	"bb-deadlift": "Barbell_Deadlift",
	"band-pull-apart": "Band_Pull_Apart",
	"pullup": "Pullups",
	"chinup": "Chin-Up",
	"db-press": "Dumbbell_Shoulder_Press",
	"db-arnold": "Arnold_Dumbbell_Press",
	"db-lateral": "Side_Lateral_Raise",
	"db-front": "Front_Dumbbell_Raise",
	"bb-ohp": "Standing_Military_Press",
	"band-lateral": "Lateral_Raise_-_With_Bands",
	"band-face-pull": "Face_Pull",
	"arm-circles": "Arm_Circles",
	"db-curl": "Dumbbell_Bicep_Curl",
	"db-hammer": "Alternate_Hammer_Curl",
	"db-concentration": "Concentration_Curls",
	"bb-curl": "Barbell_Curl",
	"bench-dips": "Bench_Dips",
	"db-kickback": "Tricep_Dumbbell_Kickback",
	"band-pushdown": "Triceps_Pushdown",
	"bb-skullcrusher": "EZ-Bar_Skullcrusher",
	"plank": "Plank",
	"crunch": "Crunches",
	"bicycle": "Air_Bike",
	"leg-raise": "Flat_Bench_Lying_Leg_Raise",
	"russian-twist": "Russian_Twist",
	"dead-bug": "Dead_Bug",
	"mountain-climber": "Mountain_Climbers",
	"ball-crunch": "Exercise_Ball_Crunch",
	"band-pallof": "Pallof_Press",
	"squat": "Bodyweight_Squat",
	"lunge-reverse-db": "Dumbbell_Rear_Lunge",
	"step-up": "Dumbbell_Step_Ups",
	"glute-bridge": "Butt_Lift_Bridge",
	"glute-bridge-single": "Single_Leg_Glute_Bridge",
	"goblet-squat": "Goblet_Squat",
	"db-rdl": "Stiff-Legged_Dumbbell_Deadlift",
	"bb-squat": "Barbell_Squat",
	"jump-squat": "Freehand_Jump_Squat",
	"ball-hamstring-curl": "Ball_Leg_Curl",
	"band-lateral-walk": "Monster_Walk",
	"inchworm": "Inchworm",
	"kb-swing": "One-Arm_Kettlebell_Swings",
	"bb-clean-press": "Clean_and_Press"
};

const mediaFor = (id) => (MEDIA[id] ? [0, 1].map((n) => `MMM-Routines/media/${MEDIA[id]}/${n}.jpg`) : null);

const FEEDBACK = ["easy", "ok", "hard"];

// Cik vingrinājumu vismaz jābūt treniņā, pat ja izvēlētajai grupai/inventāram atbilstošo ir maz
// (tad papildina ar grūtākiem, ārpus līmeņa pakāpes).
const MIN_EXERCISES = 4;

// "Viss ķermenis" izvēršas par visām grupām + speciāli pilna ķermeņa vingrinājumiem.
const FULL_BODY_GROUPS = ["legs", "chest", "back", "core", "shoulders", "arms", "full"];

const shuffle = (list, rng) => {
	const out = list.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};

const clampLevel = (level) => Math.min(MAX_LEVEL, Math.max(1, Math.round(Number(level) || 1)));

// Līmenis -> treniņa apjoms. Augstāks līmenis = vairāk vingrinājumu, vairāk sēriju,
// vairāk atkārtojumu, īsāka atpūta un (caur `tier`) grūtāki vingrinājumu varianti.
const paramsForLevel = (level) => ({
	exerciseCount: 4 + Math.ceil(level / 3), // 5..8
	sets: 2 + Math.floor(level / 4), // 2..4
	scale: 0.8 + 0.06 * level, // 0.86..1.4
	maxTier: Math.min(3, 1 + Math.floor((level - 1) / 3)), // 1 (1-3), 2 (4-6), 3 (7-10)
	restSeconds: level <= 3 ? 60 : level <= 7 ? 45 : 30
});

const detailFor = (ex, sets, amount) => {
	const unit = ex.kind === "time" ? `${amount} s` : `${amount}`;
	return `${sets} × ${unit}${ex.perSide ? " katrā pusē" : ""}`;
};

/* Sastāda vienu treniņu.
 *   targets   — TARGETS id saraksts
 *   equipment — EQUIPMENT id saraksts (ķermeņa svars vienmēr pieejams)
 *   level     — 1..MAX_LEVEL
 *   avoid     — vingrinājumu id, ko izvairīties atkārtot (iepriekšējais treniņš)
 * Atgriež { level, sets, restSeconds, exercises: [...] }; exercises var būt tukšs,
 * ja nekas neder (nevar notikt, jo ķermeņa svara vingrinājumi ir visām grupām).
 */
function generateWorkout ({ targets, equipment = [], level = 1, avoid = [], rng = Math.random }) {
	const lvl = clampLevel(level);
	const p = paramsForLevel(lvl);
	const avoidSet = new Set(avoid);

	const groups = shuffle(
		targets.includes("full") ? FULL_BODY_GROUPS : targets.filter((t) => TARGETS.some((x) => x.id === t)),
		rng
	);

	const available = EXERCISES.filter((ex) => ex.eq.length === 0 || ex.eq.some((e) => equipment.includes(e)));

	// Katrai grupai — jauktu vingrinājumu rinda: vispirms tie, kas nav bijuši iepriekšējā
	// treniņā, un tikai atbilstošā sarežģītībā (ja to ir pārāk maz — atļaujam visus).
	const queues = groups.map((g) => {
		const inGroup = available.filter((ex) => ex.groups.includes(g));
		// Augstākos līmeņos izlaiž pašus vieglākos variantus (ja pietiek citu).
		let pool = inGroup.filter((ex) => ex.tier <= p.maxTier && ex.tier >= p.maxTier - 1);
		if (pool.length < 3) pool = inGroup.filter((ex) => ex.tier <= p.maxTier);
		if (pool.length < 3) pool = inGroup;
		const fresh = shuffle(pool.filter((ex) => !avoidSet.has(ex.id)), rng);
		const repeat = shuffle(pool.filter((ex) => avoidSet.has(ex.id)), rng);
		return [...fresh, ...repeat];
	});

	const chosen = [];
	const seen = new Set();
	while (chosen.length < p.exerciseCount && queues.some((q) => q.length)) {
		for (const queue of queues) {
			while (queue.length && seen.has(queue[0].id)) queue.shift();
			const ex = queue.shift();
			if (!ex) continue;
			seen.add(ex.id);
			chosen.push(ex);
			if (chosen.length >= p.exerciseCount) break;
		}
	}

	if (chosen.length < MIN_EXERCISES) {
		const rest = shuffle(available.filter((ex) => !seen.has(ex.id) && groups.some((g) => ex.groups.includes(g))), rng)
			.sort((a, b) => (avoidSet.has(a.id) - avoidSet.has(b.id)) || (a.tier - b.tier));
		chosen.push(...rest.slice(0, MIN_EXERCISES - chosen.length));
	}

	const exercises = chosen.map((ex) => {
		const raw = ex.base * p.scale;
		const amount = ex.kind === "time" ? Math.max(10, Math.round(raw / 5) * 5) : Math.max(1, Math.round(raw));
		return {
			id: ex.id,
			name: ex.name,
			kind: ex.kind,
			amount,
			perSide: ex.perSide,
			detail: detailFor(ex, p.sets, amount)
		};
	});

	return { level: lvl, sets: p.sets, restSeconds: p.restSeconds, exercises };
}

// "Par vieglu" -> līmenis uz augšu; "par grūtu" -> uz leju; "tieši laikā" -> nemainās.
function adjustLevel (level, feedback) {
	const lvl = clampLevel(level);
	if (feedback === "easy") return clampLevel(lvl + 1);
	if (feedback === "hard") return clampLevel(lvl - 1);
	return lvl;
}

module.exports = { MAX_LEVEL, TARGETS, EQUIPMENT, EXERCISES, SEARCH_NAMES, MEDIA, FEEDBACK, videoUrlFor, mediaFor, clampLevel, generateWorkout, adjustLevel };
