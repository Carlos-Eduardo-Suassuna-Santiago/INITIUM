import panelBg from "./panel.jpg";
import crtBg from "./crt.jpg";

export function initBackgroundImages() {
  const root = document.documentElement;
  root.style.setProperty("--bg-panel", panelBg as string);
  root.style.setProperty("--bg-crt", crtBg as string);
}