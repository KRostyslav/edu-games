import { PALETTE, clear, rect, disc, dither, frame } from "@edu/pixel-ui";

/** Мініатюра балкона: вікно, підсвітка й чотири горщики різних сортів. */
export function drawPeppers(ctx, { width, height }) {
  clear(ctx, PALETTE.soilDark, width, height);

  rect(ctx, 4, 5, width - 8, 24, PALETTE.skySpring);
  frame(ctx, 4, 5, width - 8, 24, PALETTE.woodDark);
  for (const x of [42, 78]) rect(ctx, x, 5, 2, 24, PALETTE.woodDark);

  // Фітолампа згори: смуга плюс дизерингований конус світла.
  rect(ctx, 10, 0, width - 20, 3, PALETTE.warn);
  dither(ctx, 10, 3, width - 20, 9, PALETTE.warn, 3);

  rect(ctx, 0, 35, width, height - 35, PALETTE.mulch);
  rect(ctx, 0, 35, width, 1, PALETTE.soilLight);

  // Сорти різняться кольором плоду — саме так вони читаються і в самій грі.
  const pots = [
    { x: 8, fruit: PALETTE.good },
    { x: 37, fruit: PALETTE.bad },
    { x: 66, fruit: PALETTE.warn },
    { x: 95, fruit: PALETTE.accent },
  ];

  for (const pot of pots) {
    disc(ctx, pot.x + 8, 28, 6, PALETTE.leafSummer);
    disc(ctx, pot.x + 3, 32, 4, PALETTE.leafSummer);
    disc(ctx, pot.x + 13, 32, 4, PALETTE.leafSummer);
    disc(ctx, pot.x + 5, 31, 2, pot.fruit);
    disc(ctx, pot.x + 11, 34, 2, pot.fruit);
    rect(ctx, pot.x + 1, 36, 15, 2, PALETTE.vineRipe);
    rect(ctx, pot.x + 2, 38, 13, 6, PALETTE.vineRipe);
    dither(ctx, pot.x + 2, 38, 13, 6, PALETTE.woodDark, 3);
  }
}
