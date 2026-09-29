#!/usr/bin/env bash
# Uzstāda whisper.cpp uz Raspberry Pi (vai jebkura Linux) balss komandām
# MMM-VoiceCommands lomā "server" (USB mikrofons pie Pi, atpazīšana lokāli).
#
#   bash scripts/whisper/install.sh            # modelis "small-q5_1" (ieteicams latviešu valodai)
#   bash scripts/whisper/install.sh base       # ātrāks, bet latviski kļūdās biežāk
#
# Pēc tam: `arecord -l` parāda mikrofona karti (piem. "card 1") — ja tas nav
# noklusējuma ierīce, config.js MMM-VoiceCommands `server.device: "plughw:1,0"`.
set -euo pipefail

MODEL="${1:-small-q5_1}"
DIR="${WHISPER_DIR:-$HOME/whisper.cpp}"

echo "==> Pakotnes (alsa-utils = arecord, cmake/build-essential = kompilēšanai)"
sudo apt-get update
sudo apt-get install -y alsa-utils cmake build-essential git

if [ ! -d "$DIR/.git" ]; then
	echo "==> Lejupielādē whisper.cpp uz $DIR"
	git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$DIR"
else
	echo "==> Atjauno whisper.cpp ($DIR)"
	git -C "$DIR" pull --ff-only
fi

echo "==> Kompilē (Pi 5 aizņem ~5–10 min)"
cmake -S "$DIR" -B "$DIR/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$DIR/build" -j"$(nproc)" --config Release --target whisper-cli

echo "==> Lejupielādē modeli ggml-$MODEL.bin"
bash "$DIR/models/download-ggml-model.sh" "$MODEL"

echo "==> Mikrofoni:"
arecord -l || true

cat <<EOF

Gatavs. config/config.js pie MMM-VoiceCommands:

	listen: "server",
	server: {
		device: "default",   // vai "plughw:<karte>,0" no saraksta augstāk
		whisperBin: "$DIR/build/bin/whisper-cli",
		model: "$DIR/models/ggml-$MODEL.bin"
	}

Pārbaude bez MagicMirror (3 s ieraksts + atpazīšana):
	arecord -f S16_LE -r 16000 -c 1 -d 3 /tmp/t.wav && \\
	"$DIR/build/bin/whisper-cli" -m "$DIR/models/ggml-$MODEL.bin" -l lv -nt -f /tmp/t.wav
EOF
