"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const winRecordedRef = useRef<boolean>(false);

  // Tron config and state
  const GRID_SIZE = 8;
  const CELL_SIZE = 62; // must match grid cell size styles
  type Direction = "up" | "down" | "left" | "right";
  type Vec = { x: number; y: number };

  const [playerPos, setPlayerPos] = useState<Vec | null>(null);
  const [playerDir, setPlayerDir] = useState<Direction>("right");
  const [playerTrail, setPlayerTrail] = useState<Vec[]>([]);

  const [opponentPos, setOpponentPos] = useState<Vec | null>(null);
  const [opponentDir, setOpponentDir] = useState<Direction>("left");
  const [opponentTrail, setOpponentTrail] = useState<Vec[]>([]);
  const [opponentDead, setOpponentDead] = useState<boolean>(false);

  const [gameOver, setGameOver] = useState<boolean>(false);
  const [didWin, setDidWin] = useState<boolean>(false);
  const [started, setStarted] = useState<boolean>(false);

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

  // Helpers for Tron
  const posToKey = (p: Vec) => `${Math.round(p.x * 2)}:${Math.round(p.y * 2)}`;
  const isOutOfBounds = (p: Vec) => p.x < 0 || p.x >= GRID_SIZE || p.y < 0 || p.y >= GRID_SIZE;
  const addDir = (p: Vec, d: Direction): Vec => {
    switch (d) {
      case "up":
        return { x: p.x, y: p.y - 0.5 };
      case "down":
        return { x: p.x, y: p.y + 0.5 };
      case "left":
        return { x: p.x - 0.5, y: p.y };
      case "right":
        return { x: p.x + 0.5, y: p.y };
    }
  };
  const leftOf = (d: Direction): Direction => (d === "up" ? "left" : d === "down" ? "right" : d === "left" ? "down" : "up");
  const rightOf = (d: Direction): Direction => (d === "up" ? "right" : d === "down" ? "left" : d === "left" ? "up" : "down");

  const hallCellIndex = useMemo(() => {
    const idx = grid.findIndex((v) => cellValueMap[v]?.name === "grid-hall");
    return idx >= 0 ? idx : null;
  }, [grid]);
  const hallCellCoord = useMemo(() => {
    if (hallCellIndex == null) return null;
    const x = hallCellIndex % GRID_SIZE;
    const y = Math.floor(hallCellIndex / GRID_SIZE);
    return { x, y };
  }, [hallCellIndex]);

  const isBlockedByBuilding = (p: Vec): boolean => {
    if (isOutOfBounds(p)) return true;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const idx = cy * GRID_SIZE + cx;
    const def = cellValueMap[grid[idx]];
    if (!def?.name) return false;
    return def.name !== "grid-hall"; // only non-hall blocks
  };

  const resetGame = () => {
    const emptyCells: number[] = [];
    const leftEmpty: number[] = [];
    const rightEmpty: number[] = [];
    grid.forEach((v, i) => {
      const def = cellValueMap[v];
      if (def?.name) return;
      emptyCells.push(i);
      const x = i % GRID_SIZE;
      if (x < GRID_SIZE / 2) leftEmpty.push(i);
      else rightEmpty.push(i);
    });
    const rndPick = (arr: number[]) => arr[Math.floor(Math.random() * arr.length)];
    const pPool = leftEmpty.length > 0 ? leftEmpty : emptyCells;
    const oPool = rightEmpty.length > 0 ? rightEmpty : emptyCells;
    let pIndex = rndPick(pPool);
    let oIndex = rndPick(oPool);
    let guard = 0;
    while (oIndex === pIndex && guard++ < 50) oIndex = rndPick(oPool);

    const pX = (pIndex % GRID_SIZE) + 0.5;
    const pY = Math.floor(pIndex / GRID_SIZE) + 0.5;
    const oX = (oIndex % GRID_SIZE) + 0.5;
    const oY = Math.floor(oIndex / GRID_SIZE) + 0.5;

    setPlayerPos({ x: pX, y: pY });
    setPlayerDir("right");
    setPlayerTrail([{ x: pX, y: pY }]);
    setOpponentPos({ x: oX, y: oY });
    setOpponentDir("left");
    setOpponentTrail([{ x: oX, y: oY }]);
    setOpponentDead(false);
    setGameOver(false);
    setDidWin(false);
    setStarted(false);
    winRecordedRef.current = false;
  };

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

  // Initialize game when grid is ready
  useEffect(() => {
    if (grid.length === GRID_SIZE * GRID_SIZE) {
      resetGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid.length]);

  // Controls: WASD
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameOver) return;
      const key = e.key.toLowerCase();
      if (key === "w") setPlayerDir((d) => (d === "down" ? d : "up"));
      if (key === "s") setPlayerDir((d) => (d === "up" ? d : "down"));
      if (key === "a") setPlayerDir((d) => (d === "right" ? d : "left"));
      if (key === "d") setPlayerDir((d) => (d === "left" ? d : "right"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameOver]);

  // Opponent AI: choose next direction avoiding buildings/trails
  const chooseOpponentDir = (pos: Vec, dir: Direction, occupied: Set<string>): Direction => {
    const candidates: Direction[] = [dir, leftOf(dir), rightOf(dir), leftOf(leftOf(dir))];
    for (const cand of candidates) {
      const np = addDir(pos, cand);
      const hitTrail = occupied.has(posToKey(np));
      const blocked = isOutOfBounds(np) || isBlockedByBuilding(np) || hitTrail;
      if (!blocked) return cand;
    }
    return dir;
  };

  // Movement loop
  useEffect(() => {
    if (!playerPos || gameOver || !started) return;
    const interval = setInterval(() => {
      setPlayerPos((pp) => {
        if (!pp || gameOver) return pp;
        const occupied = new Set<string>();
        playerTrail.forEach((p) => occupied.add(posToKey(p)));
        opponentTrail.forEach((p) => occupied.add(posToKey(p)));
        const nextP = addDir(pp, playerDir);
        if (isOutOfBounds(nextP)) {
          setGameOver(true);
          setDidWin(false);
          return pp;
        }
        const cellIdx = Math.floor(nextP.y) * GRID_SIZE + Math.floor(nextP.x);
        const cellDef = cellValueMap[grid[cellIdx]];
        if (cellDef?.name === "grid-hall") {
          // Only allow clearing if opponent is dead
          if (opponentDead || !opponentPos) {
            setGameOver(true);
            setDidWin(true);
            if (!winRecordedRef.current) {
              try {
                const cur = parseInt(localStorage.getItem("sector") ?? "1");
                localStorage.setItem("sector", String(cur + 1));
              } catch {}
              winRecordedRef.current = true;
            }
          }
          setPlayerTrail((t) => [...t, nextP]);
          return nextP;
        }
        if (cellDef?.name && cellDef.name !== "grid-hall") {
          setGameOver(true);
          setDidWin(false);
          return pp;
        }
        if (occupied.has(posToKey(nextP)) || (opponentPos && posToKey(nextP) === posToKey(opponentPos))) {
          setGameOver(true);
          setDidWin(false);
          return pp;
        }
        setPlayerTrail((t) => [...t, nextP]);
        return nextP;
      });

      setOpponentPos((op) => {
        if (!op || gameOver || opponentDead) return op;
        const occupied = new Set<string>();
        playerTrail.forEach((p) => occupied.add(posToKey(p)));
        opponentTrail.forEach((p) => occupied.add(posToKey(p)));
        const nd = chooseOpponentDir(op, opponentDir, occupied);
        if (nd !== opponentDir) setOpponentDir(nd);
        const nextO = addDir(op, nd);
        if (isOutOfBounds(nextO)) {
          setOpponentDead(true);
          setOpponentTrail([]);
          return null;
        }
        const cellIdxO = Math.floor(nextO.y) * GRID_SIZE + Math.floor(nextO.x);
        const cellDefO = cellValueMap[grid[cellIdxO]];
        if (cellDefO?.name && cellDefO.name !== "grid-hall") {
          setOpponentDead(true);
          setOpponentTrail([]);
          return null;
        }
        const occ2 = new Set<string>();
        playerTrail.forEach((p) => occ2.add(posToKey(p)));
        opponentTrail.forEach((p) => occ2.add(posToKey(p)));
        if (occ2.has(posToKey(nextO)) || (playerPos && posToKey(nextO) === posToKey(playerPos))) {
          setOpponentDead(true);
          setOpponentTrail([]);
          return null;
        }
        setOpponentTrail((t) => [...t, nextO]);
        return nextO;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [playerPos, opponentPos, playerDir, opponentDir, gameOver, started, opponentDead, grid, playerTrail, opponentTrail]);

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <div ref={gridRef} className="relative" style={{ width: 8 * 62, height: 8 * 62 }}>
        <div className="w-full h-full grid grid-cols-8">
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
                  style={{ opacity: cellDef.name === "grid-hall" && !opponentDead ? 0.7 : 1 }}
                />
              ) : null}
            </div>
          );
        })}
        </div>

        {/* Trails and bikes overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {playerTrail.map((p, idx) => (
            <div
              key={`pt-${idx}`}
              style={{ position: "absolute", left: p.x * 62 - 3, top: p.y * 62 - 3, width: 6, height: 6, backgroundColor: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.8)" }}
            />
          ))}
          {opponentTrail.map((p, idx) => (
            <div
              key={`ot-${idx}`}
              style={{ position: "absolute", left: p.x * 62 - 3, top: p.y * 62 - 3, width: 6, height: 6, backgroundColor: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.8)" }}
            />
          ))}
          {playerPos ? (
            <img
              src="/resources/bike/1.svg"
              alt="player"
              style={{
                position: "absolute",
                left: playerPos.x * 62 - 12,
                top: playerPos.y * 62 - 12,
                width: 24,
                height: 24,
                transform: `rotate(${playerDir === "up" ? 0 : playerDir === "right" ? 90 : playerDir === "down" ? 180 : -90}deg)`,
                transformOrigin: "center center",
                filter: "drop-shadow(0 0 6px rgba(34,197,94,0.8))",
              }}
            />
          ) : null}
          {opponentPos ? (
            <img
              src="/resources/bike/1.svg"
              alt="opponent"
              style={{
                position: "absolute",
                left: opponentPos.x * 62 - 12,
                top: opponentPos.y * 62 - 12,
                width: 24,
                height: 24,
                transform: `rotate(${opponentDir === "up" ? 0 : opponentDir === "right" ? 90 : opponentDir === "down" ? 180 : -90}deg)`,
                transformOrigin: "center center",
                filter: "hue-rotate(180deg) drop-shadow(0 0 6px rgba(239,68,68,0.8))",
                opacity: 0.9,
              }}
            />
          ) : null}
        </div>

        {gameOver ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="min-w-64 max-w-80 p-4 rounded border" style={{ borderColor: didWin ? "#22c55e" : "#ef4444" }}>
              <div className="text-white text-lg font-semibold mb-2 text-center">{didWin ? "Sector Cleared!" : "Game Over"}</div>
              <div className="flex gap-2 justify-center">
                {didWin ? (
                  <Link href="/game">
                    <button className="px-3 py-2 rounded border text-white" style={{ borderColor: "#0C98E9", backgroundColor: "rgba(12,152,233,0.1)" }}>Home</button>
                  </Link>
                ) : (
                  <>
                    <button className="px-3 py-2 rounded border text-white" style={{ borderColor: "#0C98E9", backgroundColor: "rgba(12,152,233,0.1)" }} onClick={() => resetGame()}>Try Again</button>
                    <Link href="/game"><button className="px-3 py-2 rounded border text-white" style={{ borderColor: "#0C98E9", backgroundColor: "rgba(12,152,233,0.1)" }}>Home</button></Link>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

      </div>

      {/* Start button under grid */}
      {!started && !gameOver ? (
        <div className="absolute" style={{ top: `calc(50% + ${8 * 62 / 2 + 24}px)` }}>
          <button
            className="px-4 py-2 rounded border text-white"
            style={{ borderColor: accentColor, backgroundColor: "rgba(12,152,233,0.1)" }}
            onClick={() => setStarted(true)}
          >
            Start
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default Page;