import { useEffect } from "react";
import { usePublicSettings } from "./usePublicSettings.js";
import { resolveImageUrl } from "../utils/format.js";
import { isHexColor, readableAccent, textOn, darken, lighten, withAlpha } from "../utils/color.js";

// Applies the restaurant's branding to the whole document once settings
// load (and again whenever the Owner saves them):
//   - the browser tab title (replacing the build-time one from index.html)
//   - the favicon, replaced by the logo when there is one
//   - the accent colour, as CSS custom properties for both colour schemes,
//     adjusted where needed so links and buttons stay readable
// With no settings (or no brand colour) the defaults in index.css apply.

const STYLE_ID = "restaurant-brand-theme";

const accentVars = (accent, hover) => `
    --accent: ${accent};
    --accent-hover: ${hover};
    --accent-bg: ${withAlpha(accent, 0.1)};
    --accent-border: ${withAlpha(accent, 0.38)};
    --on-accent: ${textOn(accent)};`;

const themeCss = (brandColor) => {
  const light = readableAccent(brandColor, "light");
  const dark = readableAccent(brandColor, "dark");
  return `:root {${accentVars(light, darken(light, 0.15))}
}
@media (prefers-color-scheme: dark) {
  :root {${accentVars(dark, lighten(dark, 0.15))}
  }
}
`;
};

const setFavicon = (href) => {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (!link.dataset.defaultHref) link.dataset.defaultHref = link.getAttribute("href") || "";
  link.removeAttribute("type"); // the logo may be PNG/JPG/WEBP rather than SVG
  link.setAttribute("href", href || link.dataset.defaultHref);
};

export const useSiteBranding = () => {
  const { loaded, businessName, tagline, logoUrl, brandColor } = usePublicSettings();

  useEffect(() => {
    if (!loaded) return;
    document.title = `${businessName} — ${tagline || "Halls & Event Booking"}`;
  }, [loaded, businessName, tagline]);

  useEffect(() => {
    if (!loaded) return;
    setFavicon(logoUrl ? resolveImageUrl(logoUrl) : "");
  }, [loaded, logoUrl]);

  useEffect(() => {
    let style = document.getElementById(STYLE_ID);
    if (!isHexColor(brandColor)) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = themeCss(brandColor);
  }, [brandColor]);
};
