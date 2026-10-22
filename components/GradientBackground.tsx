"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// three.js is large, so the WebGL canvas loads in the browser only, after first paint.
const GradientCanvas = dynamic(() => import("./GradientCanvas"), { ssr: false });

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * Fixed, slowly moving warm-pastel gradient behind every page. A static CSS
 * gradient in the same colours shows immediately and stays if WebGL is missing.
 */
export function GradientBackground() {
  const dark = useMediaQuery("(prefers-color-scheme: dark)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="gradient-fallback absolute inset-0" />
      <div className={`absolute inset-0 transition-opacity duration-[1500ms] ${ready ? "opacity-100" : "opacity-0"}`}>
        <GradientCanvas dark={dark} animate={!reducedMotion} />
      </div>
      <div className="gradient-scrim absolute inset-0" />
    </div>
  );
}
