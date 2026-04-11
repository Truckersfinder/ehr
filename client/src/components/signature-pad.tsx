import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  className?: string;
};

function getCanvasPoint(e: PointerEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

export function SignaturePad({ value, onChange, disabled, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const pixelRatio = useMemo(() => (typeof window !== "undefined" ? Math.max(1, Math.floor(window.devicePixelRatio || 1)) : 1), []);

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange("");
  };

  const save = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL("image/png");
    onChange(dataUrl);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // Size for crisp strokes
    const cssW = 520;
    const cssH = 180;
    c.width = cssW * pixelRatio;
    c.height = cssH * pixelRatio;
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.25 * pixelRatio;

    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);

    if (value && value.startsWith("data:image/")) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        setHasInk(true);
      };
      img.src = value;
    }
  }, [pixelRatio]); // intentionally ignores `value` (we don't want to redraw while signing)

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const onDown = (e: PointerEvent) => {
      if (disabled) return;
      drawingRef.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      lastRef.current = getCanvasPoint(e, c);
    };
    const onMove = (e: PointerEvent) => {
      if (disabled) return;
      if (!drawingRef.current) return;
      const last = lastRef.current;
      const next = getCanvasPoint(e, c);
      if (!last) {
        lastRef.current = next;
        return;
      }
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      lastRef.current = next;
      if (!hasInk) setHasInk(true);
    };
    const onUp = () => {
      drawingRef.current = false;
      lastRef.current = null;
    };

    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [disabled, hasInk]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("rounded-md border bg-white overflow-hidden", disabled && "opacity-70")}>
        <canvas ref={canvasRef} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" onClick={clear} disabled={disabled || (!value && !hasInk)}>
          Clear
        </Button>
        <Button type="button" onClick={save} disabled={disabled || !hasInk}>
          Save signature
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use your finger to sign. Tap “Save signature” when done.
      </p>
    </div>
  );
}

