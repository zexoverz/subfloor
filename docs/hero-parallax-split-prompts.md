# Hero parallax — splitting the scene we already have

The first attempt generated eight layers independently and they did not share a coordinate system:
the jellyfish came out three times the size they are in the scene, the mascot landed in the sky,
and nothing lined up with anything. That is not a prompt-quality problem and no amount of
re-rolling fixes it — **independently generated layers cannot register with each other**, because
each generation picks its own composition.

So the layers are not generated. They are **separated out of the composed scene we already have**,
which means every element is already at its final position, scale, colour and lighting.

**Source:** `frontend/public/seabed.webp` — 1672 × 941. Feed the original PNG if you still have it;
if not, upscale the webp to 3344 × 1882 first and separate at that size, so the layers survive a
2× display.

---

## The rules every prompt inherits

Put these at the top of **every** request. They matter more than the wording of any single layer.

1. **The canvas never changes.** Every output is exactly 1672 × 941 (or exactly 3344 × 1882 if
   working at 2×). Not cropped, not padded, not re-framed, not centred on its subject.
2. **Nothing moves.** Every pixel that is kept stays at the same x, y and scale it has in the
   source. Do not recompose, do not centre the subject, do not "improve" the placement.
3. **What is removed becomes transparent, not filled.** True alpha, PNG-32. A layer with a white,
   black, or painted-over background is unusable — it will cover every layer behind it.
4. **One exception, and only one:** layer 1, the water, *is* inpainted. It is the only opaque layer,
   and holes in it would show the page through the ocean.
5. **Do not restyle.** Same palette, same line weight, same glow, same colour temperature as the
   source. A layer is a subset of the picture, never a new drawing of the same subject.
6. **Keep the glow with its object.** A jellyfish's halo, the lure's bloom, a bubble's rim light —
   the soft light belongs to the layer that owns the object, not to the water behind it.

A one-line check before accepting any layer: **stack it on the source at 50% opacity. Every kept
element must land exactly on its twin.** If anything is offset or resized, the layer is wrong no
matter how good it looks alone.

---

## The eight layers, back to front

Scroll speeds are what the code already expects (`HeroParallax.tsx`), and they are the design —
depth is the *difference* between them, not any one layer being good.

### 1 — `water.png` · speed 0.05 · the only opaque layer

> From the attached underwater scene, produce the water only. Remove the whale, the jellyfish, the
> ruined towers, the sunken ship, the rocks, the reef, the coral, the mascot and every bubble, and
> **paint in** what would be behind them: open water, the lit surface, the light shafts coming down,
> the distant blue haze. Fully opaque, no transparency anywhere. Exactly 1672 × 941. Everything that
> remains — the surface, the shafts, the haze gradient — must stay at exactly the position and
> brightness it has in the original.

### 2 — `structures.png` · speed 0.22

> From the attached scene, keep only the ruined towers on the left and right, the sunken ship on the
> right, and the distant fish silhouettes. Everything else fully transparent. Do not fill the gaps.
> Do not move or resize anything. Exactly 1672 × 941, PNG with alpha.

### 3 — `whale.png` · speed 0.34

> From the attached scene, keep only the whale silhouette and the small fish swimming with it,
> including their rim light. Everything else fully transparent. Do not move, resize, or redraw the
> whale — it stays exactly where and how large it is. Exactly 1672 × 941, PNG with alpha.

### 4 — `jellyfish.png` · speed 0.5

> From the attached scene, keep only the jellyfish — the two large ones on the left and every small
> one elsewhere — with their glow and their tentacles complete. Everything else fully transparent.
> Same sizes, same positions, same glow intensity as the original. Exactly 1672 × 941, PNG with
> alpha.

### 5 — `midrocks.png` · speed 0.6

> From the attached scene, keep only the mid-distance rock ridges and pillars — the ones behind the
> near reef and in front of the ruined towers. Not the foreground reef along the bottom, not the
> mascot's rock on the right. Everything else fully transparent. Exactly 1672 × 941, PNG with alpha.

### 6 — `reef.png` · speed 0.72 · the floor

> From the attached scene, keep only the near reef along the bottom: the foreground rocks and every
> plant growing on them — the coral, the glowing tube sponges, the kelp — with their glow. Not the
> mascot's rock on the right. Everything above the reef fully transparent. The reef must still touch
> the bottom edge of the canvas exactly as it does in the original. Exactly 1672 × 941, PNG with
> alpha.

### 7 — `mascot.png` · speed 0.86

> From the attached scene, keep only the rock outcrop on the right with the creature peeking over
> it, including its lure and the lure's glow. Everything else fully transparent. Same position, same
> size — it stays at the right edge, not centred. Exactly 1672 × 941, PNG with alpha.

### 8 — `bubbles.png` · speed 1.25

> From the attached scene, keep only the bubbles, every one of them, with their rim light and
> highlights. Everything else fully transparent. Same positions and sizes. Exactly 1672 × 941, PNG
> with alpha.

---

## After the layers arrive

```bash
cd frontend
for n in water structures whale jellyfish midrocks reef mascot bubbles; do
  magick "$n.png" -resize 1920x -quality 78 -define webp:method=6 "public/parallax/$n.webp"
done
```

Then in `src/components/HeroParallax.tsx`, the `LAYERS` array becomes eight entries at the speeds
above, and — because every layer is now the same canvas as every other — each one is simply
`inset-0 h-full w-full object-cover`. No per-layer `bottom` offsets, no `w-[112%]` overhang to hide
edges: layers that share a coordinate system need no nudging, which is the whole reason to separate
them rather than generate them.

The scrim behind the headline is measured against the **water** layer, since that is the brightest
thing the type can sit over. Re-measure it when the new water lands rather than assuming 0.38 still
holds.
