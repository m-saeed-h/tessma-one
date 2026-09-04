// Design system rule: a white-label theme stores exactly two colours
// (primary, accent — see BrandingService). Everything the mockup calls
// --primary-ink (pressed/darker) and --primary-wash / --accent-wash (tinted
// backgrounds) is derived from those two at render time, not a third and
// fourth stored value — one knob per brand colour, not four.

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Blend towards black (ratio 0 = original, 1 = black) — the "pressed" shade.
export function darken(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r * (1 - ratio), g * (1 - ratio), b * (1 - ratio)]);
}

// Blend towards white (ratio 0 = original, 1 = white) — a tinted background
// wash that stays legible with dark text on top, whatever the brand hue.
export function tint(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio]);
}
