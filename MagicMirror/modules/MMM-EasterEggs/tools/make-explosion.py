"""Zaļā ekrāna GIF -> caurspīdīgs animēts WebP (explosion.webp).

Lietošana (vienreiz, uz datora — Pi to nevajag):
    python3 tools/make-explosion.py avots.gif explosion.webp

Zaļo fonu padara caurspīdīgu (alfa pēc tā, cik pikselis "zaļāks" par
sarkano/zilo), noņem zaļo atblāzmu malās un izdzēš "MakeAGIF.com"
ūdenszīmi apakšējā labajā stūrī. Vajag Pillow (pip install pillow).
"""
import colorsys
import sys

from PIL import Image, ImageSequence

# Cik "zaļuma" (G - max(R, B)) ir pilnīgi necaurspīdīgs / pilnīgi caurspīdīgs.
SOLID_BELOW = 25
CLEAR_ABOVE = 110
# Zaļā ekrāna krāsa (avota GIF stūri).
KEY = (52, 250, 4)
# Nokrāsa (0..1): virs FIRE_HUE_MAX (~43°) uguns jau izskatās zaļgana.
FIRE_HUE_MAX = 0.12
FIRE_HUE = 0.1
# Ūdenszīmes taisnstūris (daļa no platuma/augstuma no apakšējā labā stūra).
WATERMARK = (0.25, 0.09)


def key_frame(frame):
	rgba = frame.convert("RGBA")
	w, h = rgba.size
	px = rgba.load()
	wx, wy = int(w * (1 - WATERMARK[0])), int(h * (1 - WATERMARK[1]))
	for y in range(h):
		for x in range(w):
			r, g, b, _ = px[x, y]
			if x >= wx and y >= wy:
				px[x, y] = (0, 0, 0, 0)
				continue
			green = g - max(r, b)
			if green <= SOLID_BELOW:
				a = 255
			elif green >= CLEAR_ABOVE:
				a = 0
			else:
				a = round(255 * (CLEAR_ABOVE - green) / (CLEAR_ABOVE - SOLID_BELOW))
			if a == 0:
				px[x, y] = (0, 0, 0, 0)
				continue
			# Pikselis = a * uguns + (1 - a) * zaļais fons -> atņemam fonu.
			r, g, b = (min(255, max(0, round((c - (1 - a / 255) * k) * 255 / a))) for c, k in zip((r, g, b), KEY))
			# Uguns ir no sarkanas līdz dzeltenai — dzeltenzaļos toņus (zaļā atblāzma)
			# pagriežam uz oranžu, piesātinājumu un spilgtumu atstājot.
			h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
			if FIRE_HUE_MAX < h < 0.5:
				r, g, b = (round(c * 255) for c in colorsys.hsv_to_rgb(FIRE_HUE, sat, v))
			px[x, y] = (r, g, b, a)
	return rgba


def main(src, dst):
	im = Image.open(src)
	frames, durations = [], []
	for frame in ImageSequence.Iterator(im):
		frames.append(key_frame(frame))
		durations.append(frame.info.get("duration", 70))
	frames[0].save(dst, save_all=True, append_images=frames[1:], duration=durations,
		loop=0, lossless=False, quality=85, alpha_quality=100, method=6)
	print(f"{dst}: {len(frames)} kadri, {sum(durations)} ms")


if __name__ == "__main__":
	main(sys.argv[1], sys.argv[2])
