"use client";
import { useEffect } from "react";

// Chrome 83 has no dvh: use the actual WebView viewport, including its keyboard.
export default function PosViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => root.style.setProperty("--pos-viewport-height", `${Math.round(window.visualViewport?.height || window.innerHeight)}px`);
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      root.style.removeProperty("--pos-viewport-height");
    };
  }, []);
  return null;
}
