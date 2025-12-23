/**
 * Helper to differentiate between click and drag interactions
 */

export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  hasMoved: boolean;
}

export const DRAG_THRESHOLD_PX = 5; // Minimum movement to count as drag

/**
 * Create a new drag state tracker
 */
export function createDragTracker(): DragState {
  return {
    isDragging: false,
    startX: 0,
    startY: 0,
    hasMoved: false,
  };
}

/**
 * Start tracking a potential drag
 */
export function startTracking(
  state: DragState,
  clientX: number,
  clientY: number,
): void {
  state.isDragging = true;
  state.startX = clientX;
  state.startY = clientY;
  state.hasMoved = false;
}

/**
 * Update drag state with mouse movement
 * Returns true if movement exceeds threshold
 */
export function updateTracking(
  state: DragState,
  clientX: number,
  clientY: number,
): boolean {
  if (!state.isDragging) return false;

  const dx = clientX - state.startX;
  const dy = clientY - state.startY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > DRAG_THRESHOLD_PX) {
    state.hasMoved = true;
  }

  return state.hasMoved;
}

/**
 * End tracking and return whether it was a drag or click
 */
export function endTracking(state: DragState): "drag" | "click" {
  const result = state.hasMoved ? "drag" : "click";
  state.isDragging = false;
  state.hasMoved = false;
  return result;
}

/**
 * Reset the tracker
 */
export function resetTracking(state: DragState): void {
  state.isDragging = false;
  state.startX = 0;
  state.startY = 0;
  state.hasMoved = false;
}
