"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type CellDef = { name: string; level?: number };

const cellValueMap: CellDef[] = [
  { name: "" },
  { name: "grid-hall", level: 1 },
  { name: "bit-storage", level: 1 },
  { name: "bit-mine", level: 1 },
  { name: "grid-hall", level: 2 },
  { name: "bit-storage", level: 2 },
  { name: "bit-mine", level: 2 },
  { name: "bit-mine", level: 3 },
  { name: "lab", level: 1 },
  { name: "portal", level: 1 },
];

const bitStorageCapacityPerLevel = 2000; // capacity of ONE level of storage

function getCellValueByName(name: string, level: number = 1): number {
  return cellValueMap.findIndex((d) => d.name === name && (d.level ?? 1) === level);
}

// Deterministic RNG from string seed (sector id)
function stringToSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomHexColorFromRng(rng: () => number): string {
  const r = Math.floor(rng() * 256);
  const g = Math.floor(rng() * 256);
  const b = Math.floor(rng() * 256);
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function replaceAccentColor(svg: string, color: string): string {
  // Replace the primary accent color used in resources
  return svg.replace(/#0C98E9/gi, color);
}

function pickRandomIndices(rng: () => number, count: number, maxExclusive: number, exclude: Set<number> = new Set()): number[] {
  const result: number[] = [];
  const taken = new Set<number>(exclude);
  while (result.length < count && taken.size < maxExclusive) {
    const idx = Math.floor(rng() * maxExclusive);
    if (!taken.has(idx)) {
      taken.add(idx);
      result.push(idx);
    }
  }
  return result;
}

function generateRandomBase(sectorId: string): { grid: number[]; bits: number } {
  const seed = stringToSeed(sectorId);
  const rng = mulberry32(seed);

  // Start with empty 8x8 grid
  const grid = Array.from({ length: 64 }, () => 0);

  // Place one grid hall level 1
  const hallIndex = Math.floor(rng() * 64);
  grid[hallIndex] = getCellValueByName("grid-hall", 1);

  // Low-level allowances for a simple base (<= level 1-2)
  const storages = 1 + Math.floor(rng() * 2); // 1-2 storages
  const mines = 1 + Math.floor(rng() * 2); // 1-2 mines

  const exclude = new Set<number>([hallIndex]);
  const storageIndices = pickRandomIndices(rng, storages, 64, exclude);
  storageIndices.forEach((i) => {
    exclude.add(i);
    const level = rng() < 0.25 ? 2 : 1; // mostly level 1
    grid[i] = getCellValueByName("bit-storage", level);
  });

  const mineIndices = pickRandomIndices(rng, mines, 64, exclude);
  mineIndices.forEach((i) => {
    exclude.add(i);
    const r = rng();
    const level = r < 0.15 ? 2 : 1; // mostly level 1
    grid[i] = getCellValueByName("bit-mine", level);
  });

  // Rare lab or portal to add flavor (10% each)
  if (rng() < 0.1) {
    const [i] = pickRandomIndices(rng, 1, 64, exclude);
    if (i !== undefined) {
      grid[i] = getCellValueByName("lab", 1);
      exclude.add(i);
    }
  }
  if (rng() < 0.1) {
    const [i] = pickRandomIndices(rng, 1, 64, exclude);
    if (i !== undefined) {
      grid[i] = getCellValueByName("portal", 1);
      exclude.add(i);
    }
  }

  // Bits amount just for storage fill visuals; choose up to total capacity
  let totalCapacity = 0;
  grid.forEach((v) => {
    const def = cellValueMap[v];
    if (def?.name.includes("storage")) {
      totalCapacity += (def.level ?? 1) * bitStorageCapacityPerLevel;
    }
  });
  const bits = totalCapacity > 0 ? Math.floor(rng() * Math.min(totalCapacity, 2000)) : 0;

  return { grid, bits };
}

const Page = () => {
  const params = useParams();
  const sectorId = String((params as Record<string, string | string[]>).id ?? "1");
  const [grid, setGrid] = useState<number[]>([]);
  const [bits, setBits] = useState<number>(0);
  const [coloredSvgs, setColoredSvgs] = useState<Map<string, string>>(new Map());

  // Deterministic color per sector
  const accentColor = useMemo(() => {
    const rng = mulberry32(stringToSeed(`accent:${sectorId}`));
    return randomHexColorFromRng(rng);
  }, [sectorId]);

  useEffect(() => {
    const { grid: g, bits: b } = generateRandomBase(sectorId);
    setGrid(g);
    setBits(b);
  }, [sectorId]);

  // Compute which storage image (0..4) to display for each storage cell index.
  const storageImageByIndex = useMemo(() => {
    const storages: { index: number; level: number }[] = [];
    grid.forEach((cell, index) => {
      const def = cellValueMap[cell];
      if (def?.name.includes("storage")) {
        const level = def.level ?? 1;
        storages.push({ index, level });
      }
    });

    // Fill order: lower-level storages first, then by grid index
    storages.sort((a, b) => a.level - b.level || a.index - b.index);

    let remaining = bits;
    const result = new Map<number, number>(); // index -> imageIndex (0..4)

    for (const s of storages) {
      const capacity = s.level * bitStorageCapacityPerLevel;
      const assigned = Math.max(0, Math.min(remaining, capacity));
      const ratio = capacity > 0 ? assigned / capacity : 0;
      const imageIndex = Math.min(4, Math.ceil(ratio * 4));
      result.set(s.index, imageIndex);
      remaining -= assigned;
    }

    return result;
  }, [grid, bits]);

  // Prepare and cache colored SVG data URLs for all visible images
  useEffect(() => {
    const neededSrcs = new Set<string>();
    grid.forEach((cell, i) => {
      const def = cellValueMap[cell];
      if (!def?.name) return;
      if (def.name.includes("storage")) {
        const level = def.level ?? 1;
        const imageIndex = storageImageByIndex.get(i) ?? 0;
        neededSrcs.add(`/resources/${def.name}/${level}/${imageIndex}.svg`);
      } else {
        const level = def.level ?? 1;
        neededSrcs.add(`/resources/${def.name}/${level}.svg`);
      }
    });

    let cancelled = false;
    const loadAll = async () => {
      const updates = new Map(coloredSvgs);
      await Promise.all(
        Array.from(neededSrcs).map(async (src) => {
          if (updates.has(src)) return;
          try {
            const res = await fetch(src);
            const text = await res.text();
            const colored = replaceAccentColor(text, accentColor);
            const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(colored)}`;
            if (!cancelled) {
              updates.set(src, dataUrl);
            }
          } catch {}
        })
      );
      if (!cancelled) setColoredSvgs(updates);
    };
    if (neededSrcs.size > 0) loadAll();
    return () => {
      cancelled = true;
    };
  }, [grid, storageImageByIndex, accentColor]);

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <div className="w-full max-w-124 h-full max-h-124 grid grid-cols-8">
        {grid.map((cell, i) => {
          const cellDef = cellValueMap[cell];
          const isEmpty = !cellDef?.name;
          const cn = "w-[62px] h-[62px] border border-white/10 flex items-end justify-center p-1";

          let src: string | null = null;
          if (!isEmpty) {
            if (cellDef.name.includes("storage")) {
              const level = cellDef.level ?? 1;
              const imageIndex = storageImageByIndex.get(i) ?? 0;
              const original = `/resources/${cellDef.name}/${level}/${imageIndex}.svg`;
              src = coloredSvgs.get(original) ?? original;
            } else {
              const level = cellDef.level ?? 1;
              const original = `/resources/${cellDef.name}/${level}.svg`;
              src = coloredSvgs.get(original) ?? original;
            }
          }

          return (
            <div className={cn} key={i}>
              {src ? (
                <img
                  src={src}
                  alt={`${cellDef.name}`}
                  className="w-full h-full max-w-20 max-h-20 object-contain"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Page;