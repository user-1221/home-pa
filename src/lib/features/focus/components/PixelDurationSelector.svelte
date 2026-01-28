<script lang="ts">
  /**
   * PixelDurationSelector Component
   *
   * Pixel-art styled duration selector with pocket watch icon.
   * Allows selection of duration in 30-minute increments.
   */

  interface Props {
    value: number;
    onchange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
  }

  const { value, onchange, min = 30, max = 300, step = 30 }: Props = $props();

  // Format duration for display in hours (e.g., "2" or "1.5")
  let durationDisplay = $derived.by(() => {
    const hours = value / 60;
    if (Number.isInteger(hours)) {
      return `${hours}`;
    }
    // Show one decimal place for half-hours (e.g., 1.5h)
    return `${hours.toFixed(1).replace(/\.0$/, "")}`;
  });

  function decrease() {
    if (value > min) {
      onchange(value - step);
    }
  }

  function increase() {
    if (value < max) {
      onchange(value + step);
    }
  }
</script>

<div class="duration-panel">
  <div class="duration-item">
    <!-- Ornate antique pocket watch icon (48x48) -->
    <svg class="duration-icon-display" viewBox="0 0 48 48" fill="none">
      <!-- === CROWN/LOOP (top winding knob) === -->
      <rect x="21" y="2" width="6" height="2" fill="#B89050" />
      <rect x="21" y="2" width="6" height="1" fill="#E8C888" />
      <rect x="22" y="4" width="4" height="2" fill="#C4A060" />
      <rect x="22" y="4" width="4" height="1" fill="#D8B070" />

      <!-- === OUTER BRASS FRAME (ornate bezel) === -->
      <rect x="14" y="8" width="20" height="2" fill="#B89050" />
      <rect x="14" y="8" width="20" height="1" fill="#E8C888" />
      <rect x="12" y="10" width="2" height="2" fill="#C4A060" />
      <rect x="34" y="10" width="2" height="2" fill="#987040" />
      <rect x="10" y="12" width="2" height="24" fill="#B89050" />
      <rect x="10" y="12" width="1" height="24" fill="#D8B070" />
      <rect x="36" y="12" width="2" height="24" fill="#886030" />
      <rect x="12" y="36" width="2" height="2" fill="#987040" />
      <rect x="34" y="36" width="2" height="2" fill="#6D4830" />
      <rect x="14" y="38" width="20" height="2" fill="#987040" />
      <rect x="14" y="39" width="20" height="1" fill="#6D4830" />

      <!-- === CLOCK FACE (ivory/cream) === -->
      <rect x="14" y="10" width="20" height="28" fill="#F5EED8" />
      <rect x="12" y="12" width="2" height="24" fill="#E9E0C8" />
      <rect x="34" y="12" width="2" height="24" fill="#D8D0B8" />

      <!-- === INNER DECORATIVE RING === -->
      <rect x="16" y="12" width="16" height="1" fill="#C4A060" />
      <rect x="15" y="13" width="1" height="2" fill="#C4A060" />
      <rect x="32" y="13" width="1" height="2" fill="#987040" />
      <rect x="15" y="33" width="1" height="2" fill="#C4A060" />
      <rect x="32" y="33" width="1" height="2" fill="#987040" />
      <rect x="16" y="35" width="16" height="1" fill="#987040" />

      <!-- === HOUR MARKERS (Roman numerals style dots) === -->
      <rect x="23" y="14" width="2" height="2" fill="#3D2A18" />
      <rect x="29" y="17" width="2" height="2" fill="#3D2A18" />
      <rect x="31" y="23" width="2" height="2" fill="#3D2A18" />
      <rect x="29" y="29" width="2" height="2" fill="#3D2A18" />
      <rect x="23" y="32" width="2" height="2" fill="#3D2A18" />
      <rect x="17" y="29" width="2" height="2" fill="#3D2A18" />
      <rect x="15" y="23" width="2" height="2" fill="#3D2A18" />
      <rect x="17" y="17" width="2" height="2" fill="#3D2A18" />

      <!-- === CLOCK HANDS (ornate dark metal) === -->
      <!-- Hour hand (pointing to ~2) -->
      <rect x="23" y="20" width="2" height="5" fill="#2D1A08" />
      <rect x="25" y="18" width="2" height="2" fill="#2D1A08" />
      <rect x="27" y="17" width="2" height="2" fill="#2D1A08" />
      <!-- Minute hand (pointing to ~12) -->
      <rect x="23" y="15" width="2" height="9" fill="#2D1A08" />

      <!-- === CENTER HUB (brass) === -->
      <rect x="22" y="23" width="4" height="4" fill="#C4A060" />
      <rect x="22" y="23" width="2" height="2" fill="#E8C888" />
      <rect x="24" y="25" width="2" height="2" fill="#886030" />
    </svg>
    <div class="duration-controls">
      <button
        class="duration-btn"
        onclick={decrease}
        disabled={value <= min}
        aria-label="Decrease duration"
      >
        <svg viewBox="0 0 12 12" fill="currentColor" class="duration-btn-icon">
          <rect x="2" y="5" width="8" height="2" />
        </svg>
      </button>
      <span class="duration-value">{durationDisplay}</span>
      <button
        class="duration-btn"
        onclick={increase}
        disabled={value >= max}
        aria-label="Increase duration"
      >
        <svg viewBox="0 0 12 12" fill="currentColor" class="duration-btn-icon">
          <rect x="5" y="2" width="2" height="8" />
          <rect x="2" y="5" width="8" height="2" />
        </svg>
      </button>
    </div>
    <span class="duration-label">HOURS</span>
  </div>
</div>

<style>
  /* Duration Panel - Matching rules-panel style */
  .duration-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 16px;
    background: oklch(var(--b1));
    border: 2px solid oklch(var(--bc) / 0.2);
  }

  .duration-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .duration-icon-display {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
  }

  .duration-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .duration-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: oklch(var(--b3));
    border: none;
    color: oklch(var(--bc));
    cursor: pointer;
    transition: all 0.1s ease;
    box-shadow:
      inset -1px -1px 0 oklch(var(--bc) / 0.2),
      inset 1px 1px 0 oklch(var(--b1) / 0.5);
  }

  .duration-btn:hover:not(:disabled) {
    background: oklch(var(--bc) / 0.2);
  }

  .duration-btn:active:not(:disabled) {
    box-shadow:
      inset 1px 1px 0 oklch(var(--bc) / 0.2),
      inset -1px -1px 0 oklch(var(--b1) / 0.5);
  }

  .duration-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .duration-btn-icon {
    width: 10px;
    height: 10px;
  }

  .duration-value {
    min-width: 32px;
    font-size: 18px;
    font-weight: bold;
    color: oklch(var(--bc));
    text-align: center;
    line-height: 1;
  }

  .duration-label {
    font-size: 9px;
    font-weight: bold;
    letter-spacing: 0.08em;
    color: oklch(var(--bc) / 0.5);
  }
</style>
