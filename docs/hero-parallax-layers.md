# Hero parallax — layer stack

What each asset is for, and how fast it moves. Back to front; the depth comes from the
*difference* in speed and contrast, not from any single layer being good.

| # | Asset | Scroll speed | Value | Why |
|---|---|---|---|---|
| 0 | CSS gradient `#041224` → `#061c34` | fixed | — | The water. No asset; a PNG gradient would band. |
| 1 | `light-shafts.png` | 0.05× | palest | Almost still. Distance is mostly stillness. |
| 2 | `marine-snow.png` (tiled) | 0.15× | pale | Two copies at different scales and speeds reads as volume. |
| 3 | `trench-walls.png` | 0.25× | washed | Frames the centre and gives the middle somewhere to be. |
| 4 | `rocks-mid.png` | 0.45× | mid | The first layer with real shape. |
| 5 | `seabed.png` (tiled ×) | 0.7× | dark | The floor. The cyan line on its top edge is the product. |
| 6 | **the mascot** | 0.7× | dark | Sits *on* the seabed, so it must move with it exactly. |
| 7 | `kelp-left.png` / `kelp-right.png` | 1.15× | near-black | Faster than the page, which is what sells the parallax. |
| 8 | `bubbles.png` (tiled) | 1.3× | faint | Drifts upward on its own, independent of scroll. |

## Rules that matter more than the artwork

**Contrast has to descend with distance.** Layer 1 nearly invisible, layer 7 nearly black. If
every layer has the same contrast, the effect reads as cut-outs sliding, not depth. This is why
each prompt names its own value, and why they must not be "improved" to look good in isolation —
layer 3 is *supposed* to look washed out on its own.

**Only three layers may be dark.** 5, 6 and 7. Everything behind them stays in the water's value
range or the hero turns into noise and the headline stops being readable.

**Anything tiled must actually tile.** Assets 2, 5 and 8. Check by placing two copies edge to edge
before using them; a seam at 1.3× scroll speed is the most visible defect on the page.

**The cyan is the only light.** It appears on the seabed's top edge, a few rock tops, the kelp rims
and the mascot's lure — and nowhere else. It is the same cyan as the floor number on the board,
which is the whole point: the light in the hero and the owner's floor are one colour.

## Motion, once the assets exist

- Scroll: `translate3d(0, scrollY * speed, 0)`, nothing else.
- Marine snow and bubbles drift continuously, slowly, independent of scroll.
- `prefers-reduced-motion` freezes all of it — the hero must still read as a still image.
- Every layer `pointer-events: none` except the content that sits above them.
