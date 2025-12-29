/**
 * @fileoverview Pointer Drag Utility
 *
 * Provides reusable pointer event handling for drag interactions.
 * Works reliably on iOS Safari, Android, and desktop browsers.
 *
 * Uses Pointer Events with setPointerCapture for reliable tracking
 * even when the pointer moves outside the original element.
 *
 * Usage:
 *   import { createDragHandler, type DragHandler, type DragCallbacks } from "$lib/utils/pointer-drag.ts";
 *
 *   const drag = createDragHandler({
 *     onStart: (coords) => { ... },
 *     onMove: (coords, delta) => { ... },
 *     onEnd: (coords, wasDrag) => { ... },
 *   });
 *
 *   <div
 *     onpointerdown={drag.start}
 *     onpointermove={drag.move}
 *     onpointerup={drag.end}
 *     onpointercancel={drag.end}
 *     onlostpointercapture={drag.end}
 *   />
 *
 * Required CSS on draggable elements:
 *   touch-action: none;
 *   user-select: none;
 *   -webkit-user-select: none;
 *   -webkit-touch-callout: none;
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Coordinates from a pointer event
 */
export interface PointerCoords {
  x: number;
  y: number;
  pointerId: number;
}

/**
 * Delta movement from start position
 */
export interface DragDelta {
  dx: number;
  dy: number;
}

/**
 * Callbacks for drag lifecycle
 */
export interface DragCallbacks<T = void> {
  /**
   * Called when drag starts (on pointerdown)
   * Return context data to pass to onMove and onEnd
   */
  onStart?: (coords: PointerCoords, e: PointerEvent) => T;

  /**
   * Called during drag movement (on pointermove)
   * Only called after movement exceeds threshold (if configured)
   */
  onMove?: (
    coords: PointerCoords,
    delta: DragDelta,
    context: T,
    e: PointerEvent,
  ) => void;

  /**
   * Called when drag ends (on pointerup, pointercancel, lostpointercapture)
   * wasDrag is true if movement exceeded threshold
   */
  onEnd?: (
    coords: PointerCoords,
    wasDrag: boolean,
    context: T,
    e: PointerEvent,
  ) => void;
}

/**
 * Configuration options for drag handler
 */
export interface DragOptions {
  /**
   * Minimum movement in pixels before considered a drag (default: 5)
   * Helps distinguish clicks from drags
   */
  threshold?: number;

  /**
   * Snap movement to increments (e.g., 5 for 5px grid)
   */
  snapIncrement?: number;

  /**
   * Whether to prevent default on pointer events (default: true)
   */
  preventDefault?: boolean;

  /**
   * Whether to stop propagation on pointer events (default: true)
   */
  stopPropagation?: boolean;
}

/**
 * Drag handler interface returned by createDragHandler
 */
export interface DragHandler {
  /**
   * Handle pointerdown - start potential drag
   */
  start: (e: PointerEvent) => void;

  /**
   * Handle pointermove - track movement during drag
   */
  move: (e: PointerEvent) => void;

  /**
   * Handle pointerup/pointercancel/lostpointercapture - end drag
   */
  end: (e: PointerEvent) => void;

  /**
   * Check if currently dragging
   */
  isDragging: () => boolean;

  /**
   * Cancel current drag without triggering onEnd
   */
  cancel: () => void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a reusable drag handler with pointer events
 *
 * @param callbacks - Lifecycle callbacks for drag events
 * @param options - Configuration options
 * @returns DragHandler with start/move/end methods
 */
export function createDragHandler<T = void>(
  callbacks: DragCallbacks<T>,
  options: DragOptions = {},
): DragHandler {
  const {
    threshold = 5,
    snapIncrement,
    preventDefault = true,
    stopPropagation = true,
  } = options;

  // Internal state
  let activePointerId: number | null = null;
  let startCoords: PointerCoords | null = null;
  let hasMoved = false;
  let context: T | undefined = undefined;

  function start(e: PointerEvent): void {
    // Ignore if already tracking a pointer
    if (activePointerId !== null) return;

    if (preventDefault) e.preventDefault();
    if (stopPropagation) e.stopPropagation();

    // Capture pointer for reliable tracking
    const target = e.currentTarget as Element;
    target.setPointerCapture(e.pointerId);

    activePointerId = e.pointerId;
    startCoords = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    hasMoved = false;

    // Call onStart callback
    if (callbacks.onStart) {
      context = callbacks.onStart(startCoords, e);
    }
  }

  function move(e: PointerEvent): void {
    // Ignore if not tracking or different pointer
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    if (!startCoords) return;

    if (preventDefault) e.preventDefault();

    const currentCoords: PointerCoords = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };

    // Calculate raw delta
    let dx = currentCoords.x - startCoords.x;
    let dy = currentCoords.y - startCoords.y;

    // Apply snap increment if configured
    if (snapIncrement) {
      dx = Math.round(dx / snapIncrement) * snapIncrement;
      dy = Math.round(dy / snapIncrement) * snapIncrement;
    }

    // Check threshold
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!hasMoved && distance < threshold) {
      return; // Not moved enough yet
    }

    hasMoved = true;

    // Call onMove callback
    if (callbacks.onMove) {
      callbacks.onMove(currentCoords, { dx, dy }, context as T, e);
    }
  }

  function end(e: PointerEvent): void {
    // Ignore if not tracking or different pointer
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    // Release pointer capture
    const target = e.currentTarget as Element;
    target.releasePointerCapture(activePointerId);

    const endCoords: PointerCoords = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };

    // Call onEnd callback
    if (callbacks.onEnd) {
      callbacks.onEnd(endCoords, hasMoved, context as T, e);
    }

    // Reset state
    activePointerId = null;
    startCoords = null;
    hasMoved = false;
    context = undefined;
  }

  function isDragging(): boolean {
    return activePointerId !== null;
  }

  function cancel(): void {
    activePointerId = null;
    startCoords = null;
    hasMoved = false;
    context = undefined;
  }

  return {
    start,
    move,
    end,
    isDragging,
    cancel,
  };
}

// ============================================================================
// Utility Helpers
// ============================================================================

/**
 * Get pointer coordinates from a PointerEvent
 */
export function getPointerCoords(e: PointerEvent): PointerCoords {
  return {
    x: e.clientX,
    y: e.clientY,
    pointerId: e.pointerId,
  };
}

/**
 * Calculate distance between two points
 */
export function distance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Snap a value to the nearest increment
 */
export function snapToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

/**
 * Convert client coordinates to element-relative coordinates
 */
export function clientToElementCoords(
  clientX: number,
  clientY: number,
  element: Element,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

/**
 * Convert client coordinates to SVG coordinates
 * Useful for SVG-based drag interactions
 */
export function clientToSvgCoords(
  clientX: number,
  clientY: number,
  svgElement: SVGSVGElement,
): { x: number; y: number } {
  const pt = svgElement.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgElement.getScreenCTM();
  if (!ctm) {
    return { x: clientX, y: clientY };
  }
  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}

// ============================================================================
// CSS Helper (for reference)
// ============================================================================

/**
 * CSS styles to apply to draggable elements:
 *
 * .draggable {
 *   touch-action: none;
 *   user-select: none;
 *   -webkit-user-select: none;
 *   -webkit-touch-callout: none;
 * }
 *
 * For the container:
 *
 * .drag-container {
 *   touch-action: none;
 *   user-select: none;
 *   -webkit-user-select: none;
 * }
 */

