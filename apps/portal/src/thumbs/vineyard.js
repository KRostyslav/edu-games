import { PALETTE, clear, rect, disc, line, dither, px } from "@edu/pixel-ui";

/** Мініатюра виноградника: небо, ряди шпалери, крони й грона. */
export function drawVineyard(ctx, { width, height }) {
  clear(ctx, PALETTE.skySummer, width, height);
  disc(ctx, 104, 9, 4, PALETTE.warn);

  // Далекі пагорби дизерингом: повітряна перспектива без жодного нового кольору.
  dither(ctx, 0, 22, width, 7, PALETTE.leafSummer, 3);

  rect(ctx, 0, 30, width, height - 30, PALETTE.soil);
  rect(ctx, 0, 30, width, 2, PALETTE.soilLight);
  dither(ctx, 0, 35, width, height - 35, PALETTE.soilDark, 2);

  line(ctx, 0, 17, width - 1, 17, PALETTE.wood);
  line(ctx, 0, 25, width - 1, 25, PALETTE.wood);

  for (const x of [16, 52, 88]) {
    rect(ctx, x, 12, 2, 20, PALETTE.woodDark);
    disc(ctx, x + 1, 16, 6, PALETTE.leafSummer);
    disc(ctx, x - 4, 21, 4, PALETTE.leafSpring);
    disc(ctx, x + 7, 21, 4, PALETTE.leafSpring);
    disc(ctx, x + 1, 27, 3, PALETTE.berry);
    disc(ctx, x + 1, 30, 2, PALETTE.berryRipe);
    px(ctx, x, 26, PALETTE.berryHighlight);
  }
}
