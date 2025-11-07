"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { twMerge } from "tw-merge";

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

const ACCENT_COLOR = "#0C98E9";

const upgradeCostPerLevel = {
  "bit-storage": 1000,
  "bit-mine": 900,
  "grid-hall": 2000,
  lab: 2000,
  portal: 2000,
};

type BuildingAvailability = Record<
  string,
  {
    level: number;
    count: number;
  }
>;

const availableBuildingPerGridHall: BuildingAvailability[] = [
  {
    "bit-storage": {
      level: 1,
      count: 2,
    },
    "bit-mine": {
      level: 1,
      count: 2,
    },
    "grid-hall": {
      level: 2,
      count: 1,
    },
  },
  {
    "bit-storage": {
      level: 2,
      count: 2,
    },
    "bit-mine": {
      level: 3,
      count: 3,
    },
    lab: {
      level: 1,
      count: 1,
    },
    "grid-hall": {
      level: 3,
      count: 1,
    },
    portal: {
      level: 1,
      count: 1,
    },
  },
];

// capacity of ONE level of storage
const bitStorageCapacityPerLevel = 2000;

const Page = () => {
  const [grid, setGrid] = useState<number[]>([]);
  const [bits, setBits] = useState<number>(2000);
  const [currentSector, setCurrentSector] = useState<number>(1);
  const [hoverElement, setHoverElement] = useState<{
    name: string;
    level: number;
  } | null>(null);
  const [hover, setHover] = useState<{
    index: number;
    allowed: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [activeElement, setActiveElement] = useState<{
    name: string;
    level: number;
    index: number;
  } | null>(null);
  const [mineUncollected, setMineUncollected] = useState<
    Record<number, number>
  >({});

  type ShopItem = string;

  useEffect(() => {
    const sector = localStorage.getItem("sector");
    if (sector) {
      setCurrentSector(parseInt(sector));
    } else {
      setCurrentSector(1);
      localStorage.setItem("sector", "1");
    }

    const saved = localStorage.getItem("grid");
    const bits = localStorage.getItem("bits");
    const mines = localStorage.getItem("mineUncollected");
    if (saved) {
      setGrid(JSON.parse(saved));
    } else {
      // demo layout: hall at 27, storage at 31, rest empty
      const newGrid = Array.from({ length: 64 }).map((_, i) =>
        i === 27 ? 1 : i === 36 ? 2 : 0
      );
      setGrid(newGrid);
      localStorage.setItem("grid", JSON.stringify(newGrid));
    }

    if (bits) {
      setBits(parseInt(bits));
    } else {
      setBits(2000);
      localStorage.setItem("bits", "2000");
    }

    if (mines) {
      try {
        const parsed = JSON.parse(mines);
        if (parsed && typeof parsed === "object") setMineUncollected(parsed);
      } catch {}
    }
  }, []);

  // Persist state changes
  useEffect(() => {
    if (grid.length > 0) {
      localStorage.setItem("grid", JSON.stringify(grid));
    }
  }, [grid]);

  useEffect(() => {
    localStorage.setItem("bits", String(bits));
  }, [bits]);

  useEffect(() => {
    localStorage.setItem("mineUncollected", JSON.stringify(mineUncollected));
  }, [mineUncollected]);

  // Helpers
  const getCellValueByName = (name: string, level: number = 1): number => {
    return cellValueMap.findIndex(
      (d) => d.name === name && (d.level ?? 1) === level
    );
  };

  const getUpgradeCost = (name: string, nextLevel: number): number | null => {
    const base = upgradeCostPerLevel[name as keyof typeof upgradeCostPerLevel];
    if (!base) return null;
    return base * nextLevel;
  };

  const highestGridHallLevel = useMemo(() => {
    let max = 0;
    grid.forEach((value) => {
      const def = cellValueMap[value];
      if (def?.name === "grid-hall") {
        const level = def.level ?? 1;
        if (level > max) max = level;
      }
    });
    return max;
  }, [grid]);

  const allowedCountsByItem = useMemo(() => {
    const counts: Record<string, number> = {};
    if (highestGridHallLevel <= 0) {
      return counts;
    }
    const availability = availableBuildingPerGridHall[highestGridHallLevel - 1];
    if (!availability) {
      return counts;
    }
    Object.entries(availability).forEach(([name, info]) => {
      if (!info) return;
      const total = info.count ?? 0;
      if (total > 0) {
        counts[name] = total;
      }
    });
    return counts;
  }, [highestGridHallLevel]);

  const placedCountsByItem = useMemo(() => {
    const counts: Record<string, number> = {};
    grid.forEach((value) => {
      const name = cellValueMap[value]?.name;
      if (!name) return;
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return counts;
  }, [grid]);

  const maxLevelByBuilding = useMemo(() => {
    const maxLevels: Record<string, number> = {};
    for (
      let levelIndex = 0;
      levelIndex < highestGridHallLevel;
      levelIndex += 1
    ) {
      const availability = availableBuildingPerGridHall[levelIndex];
      if (!availability) break;
      Object.entries(availability).forEach(([name, info]) => {
        if (!info) return;
        maxLevels[name] = Math.max(maxLevels[name] ?? 0, info.level ?? 1);
      });
    }
    return maxLevels;
  }, [highestGridHallLevel]);

  // Total storage capacity
  const totalStorageCapacity = useMemo(() => {
    let capacity = 0;
    grid.forEach((v) => {
      const def = cellValueMap[v];
      if (def?.name.includes("storage")) {
        const level = def.level ?? 1;
        capacity += level * bitStorageCapacityPerLevel;
      }
    });
    return capacity;
  }, [grid]);

  const totalUncollected = useMemo(() => {
    return Object.values(mineUncollected).reduce((a, b) => a + b, 0);
  }, [mineUncollected]);

  // Production loop: 10 bits/sec per mine level, stop at capacity
  useEffect(() => {
    const interval = setInterval(() => {
      if (totalStorageCapacity <= 0) return;
      const currentTotal = bits + totalUncollected;
      if (currentTotal >= totalStorageCapacity) return;

      // Collect all mine positions and their levels
      const mines: Array<{ index: number; level: number }> = [];
      grid.forEach((v, idx) => {
        const def = cellValueMap[v];
        if (def?.name === "bit-mine") {
          mines.push({ index: idx, level: def.level ?? 1 });
        }
      });
      if (mines.length === 0) return;

      let remainingCapacity = totalStorageCapacity - currentTotal;
      if (remainingCapacity <= 0) return;

      const next: Record<number, number> = { ...mineUncollected };
      for (const m of mines) {
        if (remainingCapacity <= 0) break;
        const produce = 10 * m.level; // per second
        const delta = Math.min(produce, remainingCapacity);
        next[m.index] = (next[m.index] ?? 0) + delta;
        remainingCapacity -= delta;
      }
      if (remainingCapacity !== totalStorageCapacity - currentTotal) {
        setMineUncollected(next);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [grid, bits, totalUncollected, totalStorageCapacity, mineUncollected]);

  // Compute remaining purchasable count for each shop item based on number of halls
  const remainingPurchasesByItem = useMemo(() => {
    const remaining: Record<string, number> = {};
    Object.entries(allowedCountsByItem).forEach(([name, allowed]) => {
      if (allowed <= 0) return;
      const placed = placedCountsByItem[name] ?? 0;
      remaining[name] = Math.max(0, allowed - placed);
    });
    return remaining;
  }, [allowedCountsByItem, placedCountsByItem]);

  const shopItems = useMemo(() => {
    return Object.keys(allowedCountsByItem).sort();
  }, [allowedCountsByItem]);

  const getPriceForItem = (item: ShopItem): number => {
    const cost = upgradeCostPerLevel[item as keyof typeof upgradeCostPerLevel];
    return cost ?? 0;
  };

  // DnD helpers
  type DragPayload =
    | { type: "shop"; item: ShopItem }
    | { type: "grid"; fromIndex: number };

  const setDragData = (e: React.DragEvent, payload: DragPayload) => {
    const json = JSON.stringify(payload);
    try {
      e.dataTransfer.setData("application/json", json);
    } catch (_) {
      e.dataTransfer.setData("text/plain", json);
    }
  };

  const getDragData = (e: React.DragEvent): DragPayload | null => {
    const json =
      e.dataTransfer.getData("application/json") ||
      e.dataTransfer.getData("text/plain");
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  // Compute which storage image (0..4) to display for each storage cell index.
  const storageImageByIndex = useMemo(() => {
    // Collect storage cells with their index and level
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
      // Map ratio to 0..4: 0, 1/4, 1/2, 3/4, full
      const imageIndex = Math.min(4, Math.ceil(ratio * 4));
      result.set(s.index, imageIndex);
      remaining -= assigned;
    }

    return result;
  }, [grid, bits]);

  return (
    <div className="w-full h-screen bg-black flex items-center justify-start">
      <div className="w-full max-w-80 h-full p-4 flex items-center justify-center">
        {activeElement?.name ? (
          <div className="w-full p-4 border-white/10 border flex flex-col items-center justify-center gap-4">
            <strong className="text-white/70 uppercase">
              {activeElement.name}
            </strong>
            <img
              src={`/resources/${activeElement.name}/${activeElement.level}${
                activeElement.name.includes("storage") ? `/4` : ""
              }.svg`}
            />
            <div className="text-white text-sm">
              Level: {activeElement.level}
            </div>
            {(() => {
              const nextLevel = activeElement.level + 1;
              const nextValue = getCellValueByName(
                activeElement.name,
                nextLevel
              );
              const cost = getUpgradeCost(activeElement.name, nextLevel);
              const maxLevel =
                maxLevelByBuilding[activeElement.name] ?? activeElement.level;
              if (activeElement.level >= maxLevel) {
                return (
                  <div className="text-white/50 text-xs uppercase tracking-wide">
                    Max Level Reached
                  </div>
                );
              }
              const canUpgrade =
                nextValue !== -1 && cost !== null && nextLevel <= maxLevel;
              const affordable = !!cost && bits >= cost;
              if (!canUpgrade) {
                return (
                  <div className="text-white/50 text-xs uppercase tracking-wide">
                    Upgrade Unavailable
                  </div>
                );
              }
              return (
                <button
                  className="px-3 py-2 rounded border text-sm font-medium transition-colors"
                  style={{
                    borderColor: ACCENT_COLOR,
                    color: "#ffffff",
                    backgroundColor: affordable
                      ? "rgba(12, 152, 233, 0.15)"
                      : "transparent",
                    cursor: affordable ? "pointer" : "not-allowed",
                    opacity: affordable ? 1 : 0.5,
                  }}
                  disabled={!affordable}
                  onClick={() => {
                    if (!affordable || !activeElement) return;
                    if (nextValue === -1 || cost === null) return;
                    const updatedGrid = [...grid];
                    updatedGrid[activeElement.index] = nextValue;
                    const updatedBits = bits - cost;
                    setBits(updatedBits);
                    setGrid(updatedGrid);
                    localStorage.setItem("bits", String(updatedBits));
                    localStorage.setItem("grid", JSON.stringify(updatedGrid));
                    setActiveElement({
                      ...activeElement,
                      level: nextLevel,
                    });
                  }}
                >
                  Upgrade to Lv {nextLevel} · {cost} bits
                </button>
              );
            })()}
            {activeElement.name === "bit-mine" ? (
              <>
                <div className="text-white/80 text-sm">
                  Rate: {10 * (activeElement.level ?? 1)} / sec
                </div>
                <div className="text-white/90 text-sm">
                  Uncollected: {mineUncollected[activeElement.index] ?? 0}
                </div>
                <button
                  className="px-3 py-1 rounded border text-white transition-colors"
                  style={{
                    borderColor: ACCENT_COLOR,
                    backgroundColor: "rgba(12, 152, 233, 0.1)",
                  }}
                  onClick={() => {
                    const amount = mineUncollected[activeElement.index] ?? 0;
                    if (amount <= 0) return;
                    const capacityLeft = Math.max(
                      0,
                      totalStorageCapacity - bits
                    );
                    const toCollect = Math.min(amount, capacityLeft);
                    if (toCollect <= 0) return;
                    setBits((b) => b + toCollect);
                    setMineUncollected((prev) => {
                      const next = { ...prev };
                      next[activeElement.index] = Math.max(
                        0,
                        (next[activeElement.index] ?? 0) - toCollect
                      );
                      if (next[activeElement.index] <= 0)
                        delete next[activeElement.index];
                      return next;
                    });
                  }}
                >
                  Collect
                </button>
              </>
            ) : activeElement.name === "portal" ? (
              <Link href={`/game/sector/${currentSector}`}>
                <button
                  className="px-3 py-1 rounded border text-white transition-colors"
                  style={{
                    borderColor: ACCENT_COLOR,
                    backgroundColor: "rgba(12, 152, 233, 0.1)",
                  }}
                >
                  Travel
                </button>
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex-1 flex-col gap-4 flex items-center justify-center">
        <div className="w-full max-w-124 h-full max-h-124 grid grid-cols-8">
          {grid.map((cell, i) => {
            const cellDef = cellValueMap[cell];
            const isEmpty = !cellDef?.name;
            const cn =
              "w-[62px] h-[62px] border border-white/10 flex items-end justify-center p-1";

            let src: string | null = null;
            if (!isEmpty) {
              if (cellDef.name.includes("storage")) {
                const level = cellDef.level ?? 1;
                const imageIndex = storageImageByIndex.get(i) ?? 0;
                src = `/resources/${cellDef.name}/${level}/${imageIndex}.svg`;
              } else {
                const level = cellDef.level ?? 1;
                src = `/resources/${cellDef.name}/${level}.svg`;
              }
            }

            const highlight =
              hover && hover.index === i
                ? hover.allowed
                  ? "border-[var(--accent)]"
                  : "border-red-400"
                : "";

            const highlightStyle =
              hover && hover.index === i
                ? {
                    borderColor: hover.allowed ? ACCENT_COLOR : "#f87171",
                    boxShadow: hover.allowed
                      ? `0 0 8px rgba(12, 152, 233, 0.45)`
                      : `0 0 8px rgba(248, 113, 113, 0.45)`,
                  }
                : undefined;

            return (
              <div
                className={twMerge(`${cn} ${highlight}`)}
                style={highlightStyle}
                key={i}
                draggable={!isEmpty}
                onClick={() => {
                  setActiveElement({
                    name: cellDef.name,
                    level: cellDef.level ?? 1,
                    index: i,
                  });
                }}
                onMouseEnter={() => {
                  if (isEmpty) return;
                  setHoverElement({
                    name: cellDef.name,
                    level: cellDef.level ?? 1,
                  });
                }}
                onMouseLeave={() => {
                  setHoverElement(null);
                }}
                onDragStart={(e) => {
                  if (isEmpty) return;
                  setDragData(e, { type: "grid", fromIndex: i });
                  setDrag({ type: "grid", fromIndex: i });
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setHover((h) => (h?.index === i ? null : h));
                  setDrag(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const data = drag; // rely on state; getData may be empty during dragover
                  if (!data) {
                    if (hover?.index === i) setHover(null);
                    return;
                  }
                  if (data.type === "shop") {
                    const item = data.item;
                    const remaining = remainingPurchasesByItem[item] ?? 0;
                    const price = getPriceForItem(item);
                    const targetEmpty = !cellValueMap[grid[i]]?.name;
                    const allowed =
                      targetEmpty && remaining > 0 && bits >= price;
                    if (
                      !hover ||
                      hover.index !== i ||
                      hover.allowed !== allowed
                    ) {
                      setHover({ index: i, allowed });
                    }
                  } else {
                    if (hover?.index === i) setHover(null);
                  }
                }}
                onDragLeave={() => {
                  if (hover?.index === i) setHover(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (hover?.index === i) setHover(null);
                  const data = drag ?? getDragData(e);
                  if (!data) return;

                  const targetEmpty = !cellValueMap[grid[i]]?.name;

                  // Only drop into empty cells
                  if (!targetEmpty) return;

                  if (data.type === "shop") {
                    const item = data.item;
                    const remaining = remainingPurchasesByItem[item] ?? 0;
                    const price = getPriceForItem(item);
                    if (remaining <= 0) return;
                    if (bits < price) return;
                    const value = getCellValueByName(item, 1);
                    if (value <= 0) return;
                    const newGrid = [...grid];
                    newGrid[i] = value;
                    setGrid(newGrid);
                    setBits((prev) => prev - price);
                    if (item === "bit-mine") {
                      setMineUncollected((prev) => ({ ...prev, [i]: 0 }));
                    }
                    return;
                  }

                  if (data.type === "grid") {
                    const from = data.fromIndex;
                    if (from === i) return;
                    const newGrid = [...grid];
                    // move uncollected if the moved entity is a mine
                    const movingDef = cellValueMap[newGrid[from]];
                    newGrid[i] = newGrid[from];
                    newGrid[from] = 0;
                    setGrid(newGrid);
                    if (movingDef?.name === "bit-mine") {
                      setMineUncollected((prev) => {
                        const next = { ...prev };
                        next[i] = next[from] ?? 0;
                        delete next[from];
                        return next;
                      });
                    }
                    return;
                  }
                }}
              >
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

        <div className="h-8 text-white/50">
          {hoverElement ? (
            <span>
              {hoverElement.name} ({hoverElement.level})
            </span>
          ) : null}
        </div>
      </div>

      <div className="w-80 p-4">
        <div className="w-full h-full border border-white/10 rounded p-3 flex flex-col gap-3 overflow-auto">
          {shopItems.map((item) => {
            const remaining = remainingPurchasesByItem[item] ?? 0;
            const price = getPriceForItem(item);
            const canDrag = remaining > 0 && bits >= price;
            let imgSrc = `/resources/${item}/1.svg`;
            if (item.includes("storage")) {
              imgSrc = `/resources/${item}/1/4.svg`;
            }
            return (
              <div
                key={item}
                className={`flex items-center gap-3 p-2 rounded border ${
                  canDrag ? "border-white/20" : "border-white/5 opacity-50"
                }`}
                draggable={canDrag}
                onDragStart={(e) => {
                  if (!canDrag) return;
                  setDragData(e, { type: "shop", item });
                  setDrag({ type: "shop", item });
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => {
                  setHover(null);
                  setDrag(null);
                }}
              >
                <img
                  src={imgSrc}
                  alt={item}
                  className="w-10 h-10 object-contain"
                />
                <div className="flex-1">
                  <div className="text-white text-sm capitalize">
                    {item.replace("-", " ")}
                  </div>
                  <div className="text-white/70 text-xs">Price: {price}</div>
                </div>
                <div className="text-white text-xs">x{remaining}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick controls for testing (optional) */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex gap-2">
        <span
          className="text-white px-2 py-2 rounded border"
          style={{
            borderColor: ACCENT_COLOR,
            backgroundColor: "rgba(12, 152, 233, 0.12)",
          }}
        >
          Bits: {bits}
        </span>
      </div>
    </div>
  );
};

export default Page;
