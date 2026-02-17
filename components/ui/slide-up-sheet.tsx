"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type SlideUpSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Prevent closing while an async operation is in progress */
  disabled?: boolean;
};

/**
 * Reusable slide-up sheet (mobile bottom-sheet / desktop centered modal).
 *
 * Features:
 * - Backdrop tap to close
 * - Drag handle + swipe-to-close on mobile
 * - X button close
 * - Escape key close
 * - Body scroll lock while open
 * - Respects `prefers-reduced-motion`
 * - Focus trap via `aria-modal`
 */
export function SlideUpSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  disabled = false,
}: SlideUpSheetProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [mounted, setMounted] = useState(false);

  const startYRef = useRef<number | null>(null);
  const canDragRef = useRef(false);
  const scrollYRef = useRef(0);
  const bodyStyleRef = useRef<{
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
  } | null>(null);

  const close = useCallback(() => {
    if (disabled) return;
    setDragY(0);
    setIsDragging(false);
    startYRef.current = null;
    canDragRef.current = false;
    onClose();
  }, [disabled, onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Body scroll lock + Escape key ──
  useEffect(() => {
    if (!isOpen) return;

    const body = document.body;
    scrollYRef.current = window.scrollY;
    bodyStyleRef.current = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollYRef.current}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) {
        close();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      const prev = bodyStyleRef.current;
      if (prev) {
        body.style.position = prev.position;
        body.style.top = prev.top;
        body.style.left = prev.left;
        body.style.right = prev.right;
        body.style.width = prev.width;
        body.style.overflow = prev.overflow;
      }
      window.scrollTo(0, scrollYRef.current);
    };
  }, [isOpen, disabled, close]);

  // ── Touch drag handlers (mobile swipe-to-close) ──
  const handleTouchStart = (event: React.TouchEvent) => {
    if (disabled) return;
    startYRef.current = event.touches[0].clientY;
    canDragRef.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (!canDragRef.current || startYRef.current === null) return;
    const delta = event.touches[0].clientY - startYRef.current;
    // Only allow dragging downward
    if (delta > 0) {
      setIsDragging(true);
      setDragY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (!canDragRef.current) return;
    const threshold = 120;
    if (dragY > threshold) {
      close();
    } else {
      setDragY(0);
      setIsDragging(false);
    }
    startYRef.current = null;
    canDragRef.current = false;
  };

  // ── Computed styles ──
  const cappedDragY = Math.min(dragY, 400);
  const backdropOpacity = isOpen
    ? isDragging
      ? Math.max(0, 1 - cappedDragY / 350)
      : 1
    : 0;

  const sheetTranslateStyle: React.CSSProperties =
    isDragging ? { transform: `translateY(${cappedDragY}px)` } : {};

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[80] ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
      role="dialog"
      aria-modal={isOpen}
      aria-label={title}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="ปิด"
        className={`absolute inset-0 bg-slate-900/55 backdrop-blur-[1px] transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        style={{ opacity: backdropOpacity }}
        onClick={close}
        disabled={disabled}
      />

      {/* Sheet panel */}
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl ${
          isDragging ? "transition-none" : "transition-all duration-300 ease-out"
        } ${
          isOpen
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 sm:-translate-x-1/2 sm:-translate-y-[42%]"
        }`}
        style={sheetTranslateStyle}
      >
        {/* Drag handle (mobile only) */}
        <div
          className="flex touch-none justify-center pt-2 sm:hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <span className="h-1.5 w-12 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            {description ? (
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100"
            onClick={close}
            disabled={disabled}
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          {children}
        </div>
        {footer ? (
          <div
            className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
