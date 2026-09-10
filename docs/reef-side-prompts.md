# Side reef art — six pieces

Drop the finished files in `frontend/public/reef/` as **`<name>.webp`**. Nothing else to wire: the
page already asks for each by name and renders nothing at all where a file is missing, so they can
land one at a time.

## What they have to be

- **Portrait, 1024 × 1536.** They stand taller than they are wide and are scaled to
  `clamp(120px, 17vw, 300px)` on screen.
- **Transparent background.** Not black, not dark blue — actually transparent. Half of each piece
  is the shape of its own silhouette against the page.
- **Anchored to one vertical edge.** The left-hand pieces are cut off flat at their left edge and
  the right-hand ones at their right, because they bleed off the side of the window. Nothing
  important within 10% of that edge.
- **No creature bigger than a thumbnail.** These are scenery beside a column of text; the mascot is
  the only character that gets to be a character.

## The style to hold

Every prompt below should end with this, unchanged:

> Cute chibi anime style, clean thick outlines, soft cel shading, deep ocean blue palette (#04244a
> to #0a3f7a) with cyan bioluminescent accents (#0ee6ea), no background, transparent PNG, full
> figure, vertical composition, mobile game art.

## The six

**`kelp-left`** — A tall stand of kelp rising from the bottom-left, ribbon-like blades curling
toward the right, a few small round bioluminescent pods glowing along the stems. Two tiny fish
between the blades.

**`rocks-right`** — A rocky outcrop climbing the right edge, barnacles and small shells on it,
soft glowing anemones in the crevices, one flat ledge near the middle.

**`coral-right`** — A branching coral colony on the right edge, fan corals and tube sponges in
teal and deep blue, a couple of cyan glow-tips, one small crab on a lower branch.

**`anemone-left`** — A cluster of sea anemones and tube worms on the left edge, tendrils drifting
right, strong cyan glow at the tips, sand and pebbles at the base.

**`wreck-right`** — The ribs of a sunken wooden ship on the right edge, half-buried, seaweed
draped over the timbers, faint cyan lights inside the gaps. Silhouetted and darker than the others.

**`rocks-left`** — A boulder pile on the left edge with a small cave mouth, glowing crystals inside
the cave, kelp behind it. Different silhouette from `rocks-right` — rounder, lower.
