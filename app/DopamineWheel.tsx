"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";

const DEFAULT_ITEMS: string[] = [
    "do laundry",
    "juggle",
    "do rubiks",
    "workout",
    "stretch",
    "organise house",
    "ride bike",
    "walk",
];

function createConfetti() {
    try {
        confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.4 },
            scalar: 0.9,
        });
    } catch {
        // no-op if canvas-confetti fails (e.g. SSR quirks)
    }
}

export function DopamineWheel() {
    const [items, setItems] = useState<string[]>(DEFAULT_ITEMS);
    const [newItem, setNewItem] = useState<string>("");
    const [isSpinning, setIsSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const [targetIndex, setTargetIndex] = useState<number | null>(null);
    const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
    const [spinDuration, setSpinDuration] = useState(4000);

    const [editingLabel, setEditingLabel] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState<string>("");

    const [isDragging, setIsDragging] = useState(false);
    const [dragStartAngle, setDragStartAngle] = useState(0);
    const [dragStartRotation, setDragStartRotation] = useState(0);

    const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const animationStartTimeRef = useRef<number | null>(null);
    const animationStartRotationRef = useRef<number>(0);
    const animationEndRotationRef = useRef<number>(0);
    const wheelRef = useRef<HTMLDivElement | null>(null);
    const dragLastAngleRef = useRef<number | null>(null);
    const dragLastTimeRef = useRef<number | null>(null);
    const dragVelocityRef = useRef<number>(0);

    const sliceAngle = useMemo(() => {
        if (items.length === 0) return 0;
        return 360 / items.length;
    }, [items.length]);

    const handleSpin = useCallback(() => {
        if (items.length === 0 || isSpinning || isDragging) return;

        const index = Math.floor(Math.random() * items.length);
        setTargetIndex(index);
        setSelectedLabel(null);

        const extraSpins = 5;
        // Align chosen slice center with the red ticker at 3 o'clock (0° in SVG coords)
        // and ensure we always spin forward by a consistent number of full turns.
        // We choose a target number of turns ahead of the current rotation, then
        // solve for the angle that places the chosen slice under the ticker.
        const currentTurns = Math.floor(rotation / 360);
        const targetTurns = currentTurns + extraSpins;
        // labelAngle_stop = baseStart + sliceAngle/2 + rotation_stop ≡ 0 (mod 360)
        // => rotation_stop = 360 * targetTurns - index * sliceAngle - sliceAngle / 2
        const targetAbsoluteRotation =
            360 * targetTurns - index * sliceAngle - sliceAngle / 2;
        const finalAngle = targetAbsoluteRotation - rotation;

        const duration = 4000 + Math.random() * 1000;
        setIsSpinning(true);
        setSpinDuration(duration);

        // Prepare animation from current rotation to target rotation
        const startRotation = rotation;
        const endRotation = rotation + finalAngle;
        animationStartRotationRef.current = startRotation;
        animationEndRotationRef.current = endRotation;
        animationStartTimeRef.current = null;

        if (animationFrameRef.current != null) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        const animate = (timestamp: number) => {
            if (animationStartTimeRef.current == null) {
                animationStartTimeRef.current = timestamp;
            }
            const elapsed = timestamp - animationStartTimeRef.current;
            const t = Math.min(1, elapsed / duration);
            // Ease-out curve for nicer finish
            const eased = 1 - Math.pow(1 - t, 3);
            const nextRotation =
                animationStartRotationRef.current +
                (animationEndRotationRef.current - animationStartRotationRef.current) * eased;
            setRotation(nextRotation);

            if (t < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            } else {
                animationFrameRef.current = null;
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        if (spinTimeoutRef.current) {
            clearTimeout(spinTimeoutRef.current);
        }

        spinTimeoutRef.current = setTimeout(() => {
            setIsSpinning(false);
            setSelectedLabel(items[index]);
            createConfetti();
        }, duration);
    }, [items, isSpinning, isDragging, rotation, sliceAngle]);

    const handleStop = useCallback(() => {
        if (!isSpinning) return;
        if (spinTimeoutRef.current) {
            clearTimeout(spinTimeoutRef.current);
        }
        setIsSpinning(false);
        if (targetIndex != null && items[targetIndex]) {
            setSelectedLabel(items[targetIndex]);
            createConfetti();
        }
    }, [isSpinning, targetIndex, items]);

    const getClosestIndexToTicker = useCallback(() => {
        if (items.length === 0 || sliceAngle === 0) return null;

        const normRotation = ((rotation % 360) + 360) % 360;
        let bestIndex = 0;
        let bestDelta = Infinity;

        items.forEach((_, index) => {
            const baseStart = index * sliceAngle;
            const labelAngle = (baseStart + sliceAngle / 2 + normRotation) % 360;
            const delta = Math.min(labelAngle, 360 - labelAngle);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestIndex = index;
            }
        });

        return bestIndex;
    }, [items, rotation, sliceAngle]);

    const handleDragEndSelect = useCallback(() => {
        const bestIndex = getClosestIndexToTicker();
        if (bestIndex == null) return;

        // Short ease to the nearest aligned position, used for gentle drags.
        const startRotation = rotation;
        const desiredBase = startRotation + bestIndex * sliceAngle + sliceAngle / 2;
        const targetTurns = Math.ceil(desiredBase / 360);
        const rotationStop = 360 * targetTurns - bestIndex * sliceAngle - sliceAngle / 2;
        const duration = 400;

        setIsSpinning(true);

        animationStartRotationRef.current = startRotation;
        animationEndRotationRef.current = rotationStop;
        animationStartTimeRef.current = null;

        if (animationFrameRef.current != null) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        const animateSnap = (timestamp: number) => {
            if (animationStartTimeRef.current == null) {
                animationStartTimeRef.current = timestamp;
            }
            const elapsed = timestamp - animationStartTimeRef.current;
            const t = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const nextRotation =
                animationStartRotationRef.current +
                (animationEndRotationRef.current - animationStartRotationRef.current) * eased;
            setRotation(nextRotation);

            if (t < 1) {
                animationFrameRef.current = requestAnimationFrame(animateSnap);
            } else {
                animationFrameRef.current = null;
                setIsSpinning(false);
                setTargetIndex(bestIndex);
                setSelectedLabel(items[bestIndex]);
                createConfetti();
            }
        };

        animationFrameRef.current = requestAnimationFrame(animateSnap);
    }, [getClosestIndexToTicker, items, rotation, sliceAngle]);

    useEffect(() => {
        return () => {
            if (spinTimeoutRef.current) {
                clearTimeout(spinTimeoutRef.current);
            }
            if (animationFrameRef.current != null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code !== "Space" && e.key !== " ") return;

            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
                return;
            }

            e.preventDefault();
            if (isSpinning) {
                handleStop();
            } else if (items.length > 0) {
                handleSpin();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handleSpin, handleStop, isSpinning, items.length]);

    const startInertialSpin = useCallback((initialVelocity: number) => {
        const bestIndex = getClosestIndexToTicker();
        if (bestIndex == null) return;

        const maxSpeed = 0.6;
        const speed = Math.min(Math.abs(initialVelocity), maxSpeed); // clamp to avoid extreme spins
        if (speed < 0.02) {
            // too small to matter; fall back to simple snap
            handleDragEndSelect();
            return;
        }

        // Longer, more pronounced ease-out than a click spin
        const minDuration = 900;
        const maxDuration = 2200;
        const duration = minDuration + (maxDuration - minDuration) * (speed / maxSpeed);

        setIsSpinning(true);
        setSpinDuration(duration);

        const startRotation = rotation;
        const extraSpinsMin = 2;
        const extraSpinsMax = 5;
        const extraSpins = extraSpinsMin + (extraSpinsMax - extraSpinsMin) * (speed / maxSpeed);
        const currentTurns = Math.floor(startRotation / 360);
        const targetTurns = currentTurns + extraSpins;
        const rotationStop = 360 * targetTurns - bestIndex * sliceAngle - sliceAngle / 2;

        animationStartRotationRef.current = startRotation;
        animationEndRotationRef.current = rotationStop;
        animationStartTimeRef.current = null;

        if (animationFrameRef.current != null) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        const animate = (timestamp: number) => {
            if (animationStartTimeRef.current == null) {
                animationStartTimeRef.current = timestamp;
            }
            const elapsed = timestamp - animationStartTimeRef.current;
            const t = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const nextRotation =
                animationStartRotationRef.current +
                (animationEndRotationRef.current - animationStartRotationRef.current) * eased;
            setRotation(nextRotation);

            if (t < 1) {
                animationFrameRef.current = requestAnimationFrame(animate);
            } else {
                animationFrameRef.current = null;
                setIsSpinning(false);
                setTargetIndex(bestIndex);
                setSelectedLabel(items[bestIndex]);
                createConfetti();
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
    }, [getClosestIndexToTicker, handleDragEndSelect, items, rotation, sliceAngle]);

    const handleWheelPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (isSpinning) return;
        const rect = wheelRef.current?.getBoundingClientRect();
        if (!rect) return;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const angle = (Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180) / Math.PI;

        setIsDragging(true);
        setDragStartAngle(angle);
        setDragStartRotation(rotation);
        dragLastAngleRef.current = angle;
        dragLastTimeRef.current = performance.now();
        dragVelocityRef.current = 0;

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleWheelPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!isDragging) return;
        const rect = wheelRef.current?.getBoundingClientRect();
        if (!rect) return;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const angle = (Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180) / Math.PI;
        const delta = angle - dragStartAngle;

        const prevAngle = dragLastAngleRef.current;
        const prevTime = dragLastTimeRef.current;
        const now = performance.now();
        if (prevAngle != null && prevTime != null) {
            const dAngle = angle - prevAngle;
            const dTime = now - prevTime;
            if (dTime > 0) {
                dragVelocityRef.current = dAngle / dTime; // deg per ms
            }
        }
        dragLastAngleRef.current = angle;
        dragLastTimeRef.current = now;

        setRotation(dragStartRotation + delta);
    };

    const handleWheelPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!isDragging) return;
        setIsDragging(false);
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            // ignore if not captured
        }
        const velocity = dragVelocityRef.current;
        if (Math.abs(velocity) > 0.02) {
            startInertialSpin(velocity);
        } else {
            handleDragEndSelect();
        }
    };

    const handleAddItem = useCallback(() => {
        const trimmed = newItem.trim();
        if (!trimmed) return;
        if (items.includes(trimmed)) {
            setNewItem("");
            return;
        }
        setItems((prev) => [...prev, trimmed]);
        setNewItem("");
    }, [items, newItem]);

    const handleRemoveItem = useCallback((label: string) => {
        setItems((prev) => prev.filter((item) => item !== label));
        if (selectedLabel === label) {
            setSelectedLabel(null);
        }
    }, [selectedLabel]);

    const handleStartEdit = useCallback((label: string) => {
        setEditingLabel(label);
        setEditingValue(label);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setEditingLabel(null);
        setEditingValue("");
    }, []);

    const handleSaveEdit = useCallback(() => {
        if (!editingLabel) return;
        const trimmed = editingValue.trim();
        if (!trimmed) {
            handleCancelEdit();
            return;
        }
        if (trimmed === editingLabel) {
            handleCancelEdit();
            return;
        }
        if (items.includes(trimmed)) {
            handleCancelEdit();
            return;
        }
        setItems((prev) => prev.map((item) => (item === editingLabel ? trimmed : item)));
        if (selectedLabel === editingLabel) {
            setSelectedLabel(trimmed);
        }
        handleCancelEdit();
    }, [editingLabel, editingValue, handleCancelEdit, items, selectedLabel]);

    const handleKeyDownNewItem: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddItem();
        }
    };

    const handleKeyDownEditItem: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSaveEdit();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            handleCancelEdit();
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-2 py-0 text-zinc-50">
            <div className="flex w-full max-w-7xl flex-col gap-2 md:flex-row md:items-start md:gap-4">
                <section className="flex basis-3/4 flex-col items-center justify-center gap-4 md:flex-[3]">
                    <div className="mb-2 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            Dopamine Wheel
                        </h1>
                        <p className="mt-1 max-w-md text-sm text-zinc-400">
                            Spin the wheel to find your next achievable activity that gently stimulates your brain&apos;s reward system
                        </p>
                    </div>

                    <div className="relative flex items-center justify-center">
                        <div
                            ref={wheelRef}
                            className={`relative h-[34rem] w-[34rem] rounded-full bg-zinc-900/80 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_60px_rgba(0,0,0,0.8)] sm:h-[36rem] sm:w-[36rem] lg:h-[38rem] lg:w-[38rem] ${isSpinning ? "cursor-default" : isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                            onPointerDown={handleWheelPointerDown}
                            onPointerMove={handleWheelPointerMove}
                            onPointerUp={handleWheelPointerUp}
                            onPointerLeave={handleWheelPointerUp}
                        >
                            <div className="pointer-events-none absolute top-1/2 -right-4 z-20 -translate-y-1/2 h-0 w-0 border-y-6 border-r-8 border-y-transparent border-r-red-500" />

                            <div
                                className="absolute inset-[0.5px] rounded-full bg-zinc-900/60 backdrop-blur-sm transition-transform ease-out"
                                style={{
                                    transitionDuration: `${spinDuration}ms`,
                                }}
                            >
                                <svg viewBox="0 0 100 100" className="h-full w-full">
                                    <defs>
                                        <linearGradient id="sliceGradient" x1="0" y1="0" x2="1" y2="1">
                                            <stop offset="0%" stopColor="#22c55e" />
                                            <stop offset="50%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#a855f7" />
                                        </linearGradient>
                                    </defs>
                                    {items.map((label, index) => {
                                        // Base angles for this slice
                                        const baseStart = index * sliceAngle;
                                        const baseEnd = baseStart + sliceAngle;

                                        // Apply current rotation to make the wheel spin
                                        const startAngle = baseStart + rotation;
                                        const endAngle = baseEnd + rotation;
                                        const largeArc = sliceAngle > 180 ? 1 : 0;

                                        const x1 = 50 + 45 * Math.cos((Math.PI * startAngle) / 180);
                                        const y1 = 50 + 45 * Math.sin((Math.PI * startAngle) / 180);
                                        const x2 = 50 + 45 * Math.cos((Math.PI * endAngle) / 180);
                                        const y2 = 50 + 45 * Math.sin((Math.PI * endAngle) / 180);

                                        // Label travels around the circle but stays horizontal
                                        const labelAngle = baseStart + sliceAngle / 2 + rotation;
                                        const labelRadius = 33;
                                        const labelX = 50 + labelRadius * Math.cos((Math.PI * labelAngle) / 180);
                                        const labelY = 50 + labelRadius * Math.sin((Math.PI * labelAngle) / 180);

                                        const isHighlighted =
                                            selectedLabel === label && !isSpinning;

                                        return (
                                            <g key={label}>
                                                <path
                                                    d={`M50,50 L${x1},${y1} A45,45 0 ${largeArc},1 ${x2},${y2} Z`}
                                                    fill={isHighlighted ? "url(#sliceGradient)" : "#18181b"}
                                                    className={
                                                        isHighlighted
                                                            ? "shadow-[0_0_25px_rgba(94,234,212,0.7)]"
                                                            : ""
                                                    }
                                                />
                                                <text
                                                    x={labelX}
                                                    y={labelY}
                                                    textAnchor="middle"
                                                    dominantBaseline="middle"
                                                    className="select-none fill-zinc-300 text-[3.5px]"
                                                >
                                                    {label}
                                                </text>
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>

                            <div className="pointer-events-none absolute inset-1 rounded-full border border-white/10" />
                            <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.18)]" />
                        </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={handleSpin}
                            disabled={isSpinning || items.length === 0}
                            className="inline-flex items-center justify-center rounded-full bg-zinc-50 px-6 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {isSpinning ? "Spinning..." : "Spin"}
                        </button>
                        <button
                            type="button"
                            onClick={handleStop}
                            disabled={!isSpinning}
                            className="inline-flex items-center justify-center rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            Stop
                        </button>
                    </div>

                    <div className="mt-2 h-10 text-center text-sm text-zinc-300">
                        {selectedLabel && !isSpinning && (
                            <p>
                                Next up: <span className="font-medium text-emerald-300">{selectedLabel}</span>
                            </p>
                        )}
                    </div>
                </section>

                <aside className="flex w-full max-w-md basis-1/4 flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.8)] md:mt-16 md:h-[38rem] md:max-h-none md:overflow-hidden md:flex-[1]">
                    <div className="flex items-baseline justify-between gap-2">
                        <h2 className="text-sm font-medium text-zinc-100">Wheel items</h2>
                        <span className="text-xs text-zinc-500">{items.length} active</span>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-sm">
                        <input
                            type="text"
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            onKeyDown={handleKeyDownNewItem}
                            placeholder="Add a new option"
                            className="h-7 flex-1 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={handleAddItem}
                            className="rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-200"
                        >
                            Add
                        </button>
                    </div>

                    <div className="mt-1 flex-1 space-y-1 overflow-auto rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-2 py-3 text-xs">
                        {items.length === 0 && (
                            <p className="px-2 py-4 text-center text-zinc-500">
                                No items yet. Add a few small, appealing actions.
                            </p>
                        )}
                        {items.map((label) => (
                            <div
                                key={label}
                                className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-900/80"
                            >
                                {editingLabel === label ? (
                                    <>
                                        <input
                                            type="text"
                                            value={editingValue}
                                            onChange={(e) => setEditingValue(e.target.value)}
                                            onKeyDown={handleKeyDownEditItem}
                                            className="h-7 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-[11px] text-zinc-100 focus:outline-none"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSaveEdit}
                                            className="rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-900 hover:bg-zinc-200"
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            className="rounded-full px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex-1 truncate text-[11px] text-zinc-200">
                                            {label}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleStartEdit(label)}
                                            className="rounded-full px-2 py-0.5 text-[10px] text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-100"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveItem(label)}
                                            className="rounded-full px-2 py-0.5 text-[10px] text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-100"
                                        >
                                            Remove
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                        Tip: Keep options small and gentle. You can always spin again.
                    </p>
                </aside>
            </div>
        </div>
    );
}

export default DopamineWheel;
