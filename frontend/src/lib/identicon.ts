/**
 * A deterministic identicon for an address, as an inline SVG data URI.
 *
 * Written rather than installed: the whole thing is a hash, a palette pick, and a mirrored grid,
 * and a dependency for that would be larger than the code and harder to reason about than the five
 * lines that matter. Mirrored on the vertical axis, like every blockie anyone recognises.
 */
const GRID = 8;

function hash(address: string): number[] {
  // Deterministic and cheap: no cryptographic claim here, it only has to be stable per address.
  const bytes: number[] = [];
  const clean = address.toLowerCase().replace(/^0x/, '');
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return bytes;
}

export function identicon(address: string): string {
  const bytes = hash(address);
  const hue = ((bytes[0] ?? 0) * 360) / 256;
  const fill = `hsl(${hue} 52% 46%)`;
  const spot = `hsl(${(hue + 150) % 360} 46% 58%)`;

  let cells = '';
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID / 2; x++) {
      const byte = bytes[(y * (GRID / 2) + x) % bytes.length] ?? 0;
      if (byte % 3 === 0) continue;
      const colour = byte % 7 === 0 ? spot : fill;
      // Draw each cell and its mirror, so the result reads as a face rather than as noise.
      cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colour}"/>`;
      cells += `<rect x="${GRID - 1 - x}" y="${y}" width="1" height="1" fill="${colour}"/>`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges"><rect width="${GRID}" height="${GRID}" fill="hsl(${hue} 30% 22%)"/>${cells}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
