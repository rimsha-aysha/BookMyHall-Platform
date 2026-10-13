// Small colour helpers for the restaurant's configurable accent colour.

export const DEFAULT_ACCENT = "#8c5d2a"; // matches the light theme's --accent in index.css

export const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(value || "");

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// WCAG relative luminance (0 = black, 1 = white).
const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const LIGHT_PAGE = "#f7f5f1"; // --bg (light theme)
const DARK_PAGE = "#151412"; // --bg (dark theme)
const READABLE = 4.5; // WCAG AA for normal text

// The accent is also the link colour, so it needs contrast with the page.
export const isReadableOnLightPage = (hex) => contrastRatio(hex, LIGHT_PAGE) >= READABLE;

// White or near-black text, whichever reads better on the accent colour
// (button labels, badges).
export const textOn = (hex) => (contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#1d1810") ? "#ffffff" : "#1d1810");

// The colour mixed `amount` (0–1) of the way towards `target`.
const mix = (hex, target, amount) => {
  const t = channels(target);
  const toHex = (c, i) => Math.round(c + (t[i] - c) * amount).toString(16).padStart(2, "0");
  return `#${channels(hex).map(toHex).join("")}`;
};

export const darken = (hex, amount) => mix(hex, "#000000", amount);
export const lighten = (hex, amount) => mix(hex, "#ffffff", amount);

// The accent adjusted, in steps, until it is readable on the given page
// colour — darker for the light theme, lighter for the dark theme.
export const readableAccent = (hex, theme) => {
  const page = theme === "dark" ? DARK_PAGE : LIGHT_PAGE;
  const adjust = theme === "dark" ? lighten : darken;
  let color = hex;
  for (let step = 0; step < 10 && contrastRatio(color, page) < READABLE; step += 1) {
    color = adjust(color, 0.12);
  }
  return color;
};

// "#rrggbb" -> "rgba(r, g, b, alpha)" — for tinted backgrounds and borders.
export const withAlpha = (hex, alpha) => `rgba(${channels(hex).join(", ")}, ${alpha})`;
