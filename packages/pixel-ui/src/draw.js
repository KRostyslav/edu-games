/**
 * Примітиви малювання. Усі координати — цілі числа в логічних пікселях.
 *
 * Текст на канві навмисно не малюється: підписи, цифри й пояснення живуть
 * у DOM поверх канви. Це дає коректну кирилицю, доступність і виділення тексту,
 * яких растровий шрифт на 5×7 пікселів не дав би.
 */

export function clear(ctx, color, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

export function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** Лінія за Брезенхемом — рівна «пікселька» без згладжування. */
export function line(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    ctx.fillRect(x, y, 1, 1);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Заповнений «круг» цілими пікселями — для ягід, крон, плям. */
export function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const rr = r * r;
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= rr) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
  }
}

/**
 * Дизеринг шаховим візерунком — класичний піксельний прийом для градієнтів
 * і напівпрозорості без альфа-каналу (туман, іній, тінь, мокрий ґрунт).
 */
export function dither(ctx, x, y, w, h, color, density = 2) {
  ctx.fillStyle = color;
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if ((i + j) % density === 0) ctx.fillRect(Math.round(x + i), Math.round(y + j), 1, 1);
    }
  }
}

/** Рамка в один піксель. */
export function frame(ctx, x, y, w, h, color) {
  rect(ctx, x, y, w, 1, color);
  rect(ctx, x, y + h - 1, w, 1, color);
  rect(ctx, x, y, 1, h, color);
  rect(ctx, x + w - 1, y, 1, h, color);
}

/**
 * Спрайт із текстової матриці: масив рядків, де кожен символ — ключ у палітрі,
 * а пробіл означає прозорість. Дозволяє тримати графіку читабельною прямо в коді.
 */
export function sprite(ctx, x, y, rows, colorMap) {
  for (let j = 0; j < rows.length; j += 1) {
    const row = rows[j];
    for (let i = 0; i < row.length; i += 1) {
      const key = row[i];
      const color = colorMap[key];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}
