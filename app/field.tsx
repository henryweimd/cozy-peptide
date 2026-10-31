"use client";

import { useEffect, useRef } from "react";
import styles from "./page.module.css";

const SEQUENCE = "CPRVTCSNDTVCKVRTSKCSVCRISVNTC";
const RAW_ALPHABET = "ACDEFGHIKLMNPQRSTVWY";
const RAMP = ".:-=+*#%@";

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cobalt ASCII field: the product's own traffic on an 8 by 16 cell. Raw
 * amino-acid proposals on the left resolve into the verified 29-mer on the
 * right. Painted once as a composed still; a dot grid stands in without
 * script, and the still is identical under reduced motion.
 */
export default function Field() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;

    const computed = getComputedStyle(canvas);
    const ink = (name: string): string =>
      computed.getPropertyValue(name).trim();
    const tints = [
      ink("--color-glyph-1"),
      ink("--color-glyph-2"),
      ink("--color-glyph-3"),
      ink("--color-glyph-4"),
      ink("--color-accent-deep"),
    ];

    let frame = 0;
    const paint = (): void => {
      const parent = canvas.parentElement;
      if (parent === null) return;
      const rect = parent.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * density));
      canvas.height = Math.max(1, Math.floor(rect.height * density));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = `${10 * density}px "JetBrains Mono", monospace`;
      context.textBaseline = "top";
      const cellW = 8 * density;
      const cellH = 16 * density;
      const random = mulberry32(20261026);
      const cols = Math.ceil(canvas.width / cellW);
      const rows = Math.ceil(canvas.height / cellH);
      const seqRow = Math.floor(rows * 0.965);
      const seqCol = Math.floor(cols * 0.06);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const denseSide = col / cols >= 0.55;
          if (!denseSide && random() > 0.12) continue;
          const densityAt = denseSide ? 0.45 + random() * 0.55 : 0.5;
          if (densityAt < 0.4) continue;
          const tier = denseSide
            ? Math.min(4, Math.floor(((densityAt - 0.4) / 0.6) * 5))
            : Math.floor(random() * 2);
          context.fillStyle = tints[tier] || tints[0];
          const glyph = denseSide
            ? RAW_ALPHABET[Math.floor(random() * RAW_ALPHABET.length)]
            : RAMP[Math.floor(random() * RAMP.length)];
          context.fillText(glyph ?? ".", col * cellW, row * cellH);
        }
      }
      context.fillStyle = tints[4] || tints[0];
      context.fillText(
        SEQUENCE,
        seqCol * cellW,
        seqRow * cellH
      );
    };

    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    };
    paint();
    const observer = new ResizeObserver(schedule);
    if (canvas.parentElement !== null) observer.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={styles.field}
      aria-hidden="true"
      role="presentation"
    />
  );
}
