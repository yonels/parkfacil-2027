// Loader de la hoja legacy para WebView antiguo (TUU PRO2, WebView 83).
// Solo actúa si el navegador NO soporta cascade layers (Chrome < 99): en ese
// caso descarga las mismas hojas /_next/*.css que ya cargó la página, las
// transforma (legacyCss.mjs) y las inserta justo después de cada <link>.
// En navegadores modernos no hace nada.

import { needsLegacyCss, transformCssForLegacyWebView } from "./legacyCss.mjs";

let started = false;
const processed = new Set();

// Chrome 83 soporta gap en grid pero no en flex (84+). No hay @supports que
// lo distinga: se mide.
function supportsFlexGap(doc) {
  try {
    const box = doc.createElement("div");
    box.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden;pointer-events:none";
    box.appendChild(doc.createElement("div"));
    box.appendChild(doc.createElement("div"));
    doc.documentElement.appendChild(box);
    const supported = box.scrollHeight === 1;
    box.parentNode.removeChild(box);
    return supported;
  } catch {
    return true;
  }
}

function appStylesheetUrl(link, win) {
  try {
    const url = new URL(link.href, win.location.href);
    return url.origin === win.location.origin && url.pathname.startsWith("/_next/") ? url.href : null;
  } catch {
    return null;
  }
}

async function insertLegacyStylesheet(link, href, win, options) {
  try {
    const response = await win.fetch(href, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const css = await response.text();
    const style = win.document.createElement("style");
    style.setAttribute("data-pf-legacy-css", new URL(href).pathname);
    style.textContent = transformCssForLegacyWebView(css, { ...options, baseUrl: href });
    if (link.parentNode) link.parentNode.insertBefore(style, link.nextSibling);
    else win.document.head.appendChild(style);
  } catch (error) {
    processed.delete(href);
    if (win.console && win.console.warn) win.console.warn("[ParkFacil POS] hoja legacy no aplicada", href, error);
  }
}

export function startLegacyCssSupport(win) {
  if (started || !win || !win.document || !needsLegacyCss(win)) return false;
  started = true;
  const doc = win.document;
  const run = () => {
    const options = { flexGapFallback: !supportsFlexGap(doc) };
    const scan = () => {
      const links = doc.querySelectorAll('link[rel="stylesheet"]');
      for (let index = 0; index < links.length; index += 1) {
        const href = appStylesheetUrl(links[index], win);
        if (!href || processed.has(href)) continue;
        processed.add(href);
        insertLegacyStylesheet(links[index], href, win, options);
      }
    };
    scan();
    // Navegación cliente: Next agrega <link> nuevos al <head>.
    if (win.MutationObserver) new win.MutationObserver(scan).observe(doc.head || doc.documentElement, { childList: true, subtree: true });
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
  return true;
}
