<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, onDestroy } from "svelte";

  interface Props {
    value: string; // HH:mm format
    onchange?: () => void;
  }

  let { value = $bindable(""), onchange }: Props = $props();

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  // ---- Drum Roll Constants ----
  const ITEM_HEIGHT = 44;
  const VISIBLE_ITEMS = 3;
  const VISIBLE_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 132px
  const CENTER_Y = (VISIBLE_HEIGHT - ITEM_HEIGHT) / 2; // 44px
  const FRICTION = 0.95;
  const MIN_VELOCITY = 0.5; // px/frame threshold to stop momentum
  const MAX_VELOCITY = 30; // px/frame cap for fast flicks

  // ---- Parse initial value eagerly ----
  const initParts = value ? value.split(":").map(Number) : [];
  const initHour = initParts[0] || 0;
  const initMinute = initParts[1] || 0;

  let currentHour = $state(initHour);
  let currentMinute = $state(initMinute);
  let isMobile = $state(false);

  // Parse value into hour/minute on subsequent changes
  $effect(() => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      currentHour = h ?? 0;
      currentMinute = m ?? 0;
    }
  });

  function updateTime() {
    const newValue = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
    value = newValue;
    onchange?.();
  }

  // ---- Desktop handlers ----
  function handleHourChange(e: Event & { currentTarget: HTMLSelectElement }) {
    currentHour = Number(e.currentTarget.value);
    updateTime();
  }

  function handleMinuteChange(e: Event & { currentTarget: HTMLSelectElement }) {
    currentMinute = Number(e.currentTarget.value);
    updateTime();
  }

  const WHEEL_SNAP_DELAY = 150; // ms after last wheel tick before snapping

  // ---- Drum Roll Wheel Controller ----
  class DrumRollWheel {
    offset = $state(0);
    isDragging = $state(false);
    isSnapping = $state(false);

    private velocity = 0;
    private rafId: number | null = null;
    private wheelSnapTimer: ReturnType<typeof setTimeout> | null = null;
    private samples: Array<{ y: number; t: number }> = [];
    private startY = 0;
    private startOffset = 0;
    private readonly maxIndex: number;
    private readonly maxOffset: number;
    private readonly selectCallback: (index: number) => void;

    constructor(
      maxIndex: number,
      initialIndex: number,
      onSelect: (index: number) => void,
    ) {
      this.maxIndex = maxIndex;
      this.maxOffset = maxIndex * ITEM_HEIGHT;
      this.selectCallback = onSelect;
      this.offset = initialIndex * ITEM_HEIGHT;
    }

    get selectedIndex(): number {
      return Math.max(
        0,
        Math.min(this.maxIndex, Math.round(this.offset / ITEM_HEIGHT)),
      );
    }

    /** Set offset from parent value. Skips if user is interacting. */
    setIndex(index: number): void {
      if (!this.isDragging && !this.isSnapping) {
        this.offset = index * ITEM_HEIGHT;
      }
    }

    // ---- Shared drag helpers ----
    private beginDrag(clientY: number): void {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.startY = clientY;
      this.startOffset = this.offset;
      this.velocity = 0;
      this.samples = [{ y: clientY, t: Date.now() }];
      this.isDragging = true;
      this.isSnapping = false;
    }

    private moveDrag(clientY: number): void {
      const deltaY = this.startY - clientY;
      let newOffset = this.startOffset + deltaY;

      if (newOffset < 0) {
        newOffset = newOffset * 0.3;
      } else if (newOffset > this.maxOffset) {
        newOffset = this.maxOffset + (newOffset - this.maxOffset) * 0.3;
      }

      this.offset = newOffset;

      const now = Date.now();
      this.samples.push({ y: clientY, t: now });
      const cutoff = now - 100;
      this.samples = this.samples.filter((s) => s.t >= cutoff);
    }

    private endDrag(): void {
      if (!this.isDragging) return;
      this.isDragging = false;

      if (this.samples.length >= 2) {
        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];
        if (first && last) {
          const dt = last.t - first.t;
          if (dt > 0) {
            const pxPerMs = -(last.y - first.y) / dt;
            this.velocity = pxPerMs * 16.67;
            const absV = Math.abs(this.velocity);
            if (absV > MAX_VELOCITY) {
              this.velocity = Math.sign(this.velocity) * MAX_VELOCITY;
            }
          }
        }
      }

      if (Math.abs(this.velocity) > MIN_VELOCITY) {
        this.runMomentum();
      } else {
        this.snapToNearest();
      }
    }

    // ---- Touch handlers ----
    onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      this.beginDrag(touch.clientY);
    };

    onTouchMove = (e: TouchEvent): void => {
      if (!this.isDragging || e.touches.length > 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      this.moveDrag(touch.clientY);
    };

    onTouchEnd = (_e: TouchEvent): void => {
      this.endDrag();
    };

    // ---- Mouse handlers ----
    onMouseDown = (e: MouseEvent): void => {
      if (e.button !== 0) return; // left click only
      e.preventDefault();
      this.beginDrag(e.clientY);
      document.addEventListener("mousemove", this.onDocumentMouseMove);
      document.addEventListener("mouseup", this.onDocumentMouseUp);
    };

    private onDocumentMouseMove = (e: MouseEvent): void => {
      if (!this.isDragging) return;
      e.preventDefault();
      this.moveDrag(e.clientY);
    };

    private onDocumentMouseUp = (_e: MouseEvent): void => {
      document.removeEventListener("mousemove", this.onDocumentMouseMove);
      document.removeEventListener("mouseup", this.onDocumentMouseUp);
      this.endDrag();
    };

    // ---- Mouse wheel handler ----
    onWheel = (e: WheelEvent): void => {
      e.preventDefault();

      // Cancel momentum / snap in progress
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.isSnapping = false;

      // Scroll by deltaY (typically ~100px per tick)
      const step = Math.sign(e.deltaY) * ITEM_HEIGHT;
      this.offset = Math.max(0, Math.min(this.maxOffset, this.offset + step));

      // Debounce snap: wait for user to stop scrolling
      if (this.wheelSnapTimer !== null) {
        clearTimeout(this.wheelSnapTimer);
      }
      this.wheelSnapTimer = setTimeout(() => {
        this.wheelSnapTimer = null;
        this.snapToNearest();
      }, WHEEL_SNAP_DELAY);
    };

    private runMomentum = (): void => {
      this.offset += this.velocity;
      this.velocity *= FRICTION;

      if (this.offset < 0) {
        this.offset = 0;
        this.velocity = 0;
      } else if (this.offset > this.maxOffset) {
        this.offset = this.maxOffset;
        this.velocity = 0;
      }

      if (Math.abs(this.velocity) > MIN_VELOCITY) {
        this.rafId = requestAnimationFrame(this.runMomentum);
      } else {
        this.snapToNearest();
      }
    };

    private snapToNearest = (): void => {
      const targetIndex = Math.max(
        0,
        Math.min(this.maxIndex, Math.round(this.offset / ITEM_HEIGHT)),
      );
      const targetOffset = targetIndex * ITEM_HEIGHT;

      this.isSnapping = true;
      this.offset = targetOffset;

      setTimeout(() => {
        this.isSnapping = false;
        this.selectCallback(targetIndex);
      }, 200);
    };

    destroy(): void {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.wheelSnapTimer !== null) {
        clearTimeout(this.wheelSnapTimer);
        this.wheelSnapTimer = null;
      }
      document.removeEventListener("mousemove", this.onDocumentMouseMove);
      document.removeEventListener("mouseup", this.onDocumentMouseUp);
    }
  }

  // ---- Create wheel instances ----
  const hourWheel = new DrumRollWheel(23, initHour, (index) => {
    currentHour = index;
    updateTime();
  });

  const minuteWheel = new DrumRollWheel(59, initMinute, (index) => {
    currentMinute = index;
    updateTime();
  });

  // ---- Container refs for wheel event listeners ----
  let hourContainerRef: HTMLDivElement | undefined = $state();
  let minuteContainerRef: HTMLDivElement | undefined = $state();

  // ---- Sync parent value changes → wheel offsets ----
  $effect(() => {
    if (isMobile) {
      hourWheel.setIndex(currentHour);
    }
  });

  $effect(() => {
    if (isMobile) {
      minuteWheel.setIndex(currentMinute);
    }
  });

  // ---- Mobile detection & wheel event registration ----
  if (browser) {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };

    // wheel events need { passive: false } to allow preventDefault
    const attachWheelListeners = () => {
      hourContainerRef?.addEventListener("wheel", hourWheel.onWheel, {
        passive: false,
      });
      minuteContainerRef?.addEventListener("wheel", minuteWheel.onWheel, {
        passive: false,
      });
    };
    const detachWheelListeners = () => {
      hourContainerRef?.removeEventListener("wheel", hourWheel.onWheel);
      minuteContainerRef?.removeEventListener("wheel", minuteWheel.onWheel);
    };

    onMount(() => {
      checkMobile();
      window.addEventListener("resize", checkMobile);
      attachWheelListeners();
    });
    onDestroy(() => {
      window.removeEventListener("resize", checkMobile);
      detachWheelListeners();
      hourWheel.destroy();
      minuteWheel.destroy();
    });
  }

  // ---- Item visual helpers ----
  function getItemOpacity(itemY: number): number {
    const dist = Math.abs(itemY - CENTER_Y);
    const norm = Math.min(dist / (VISIBLE_HEIGHT / 2), 1);
    return 1.0 - norm * 0.7;
  }

  function getItemScale(itemY: number): number {
    const dist = Math.abs(itemY - CENTER_Y);
    const norm = Math.min(dist / (VISIBLE_HEIGHT / 2), 1);
    return 1.0 - norm * 0.1;
  }
</script>

<div class="rounded-box border border-base-300 bg-base-200 p-4">
  <div
    class="mb-3 text-center text-xs font-medium text-[var(--color-text-secondary)]"
  >
    時間を選択
  </div>

  {#if isMobile}
    <!-- Mobile: Drum Roll Picker -->
    <div class="flex items-center justify-center gap-2">
      <!-- Hour Wheel -->
      <div class="relative flex flex-col items-center gap-1">
        <span class="text-[10px] font-medium text-[var(--color-text-muted)]"
          >時</span
        >
        <div class="relative">
          <!-- Selection highlight overlay -->
          <div
            class="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded border border-[var(--color-primary)] bg-[var(--color-primary-100)]/30"
            style="height: {ITEM_HEIGHT}px;"
          ></div>
          <!-- Wheel container -->
          <div
            bind:this={hourContainerRef}
            class="wheel-container relative cursor-grab overflow-hidden active:cursor-grabbing"
            style="height: {VISIBLE_HEIGHT}px; width: 72px; touch-action: none;"
            ontouchstart={hourWheel.onTouchStart}
            ontouchmove={hourWheel.onTouchMove}
            ontouchend={hourWheel.onTouchEnd}
            onmousedown={hourWheel.onMouseDown}
          >
            {#each hours as hour, i (hour)}
              {@const itemY = i * ITEM_HEIGHT - hourWheel.offset + CENTER_Y}
              <div
                class="absolute inset-x-0 flex items-center justify-center text-base tabular-nums
                  {i === hourWheel.selectedIndex
                  ? 'font-semibold text-[var(--color-primary)]'
                  : 'text-base-content'}"
                style="height: {ITEM_HEIGHT}px; transform: translateY({itemY}px) scale({getItemScale(
                  itemY,
                )}); opacity: {getItemOpacity(itemY)};"
                class:wheel-item-snapping={hourWheel.isSnapping}
              >
                {String(hour).padStart(2, "0")}
              </div>
            {/each}
          </div>
        </div>
      </div>

      <span class="text-lg font-medium text-base-content/60">:</span>

      <!-- Minute Wheel -->
      <div class="relative flex flex-col items-center gap-1">
        <span class="text-[10px] font-medium text-[var(--color-text-muted)]"
          >分</span
        >
        <div class="relative">
          <!-- Selection highlight overlay -->
          <div
            class="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded border border-[var(--color-primary)] bg-[var(--color-primary-100)]/30"
            style="height: {ITEM_HEIGHT}px;"
          ></div>
          <!-- Wheel container -->
          <div
            bind:this={minuteContainerRef}
            class="wheel-container relative cursor-grab overflow-hidden active:cursor-grabbing"
            style="height: {VISIBLE_HEIGHT}px; width: 72px; touch-action: none;"
            ontouchstart={minuteWheel.onTouchStart}
            ontouchmove={minuteWheel.onTouchMove}
            ontouchend={minuteWheel.onTouchEnd}
            onmousedown={minuteWheel.onMouseDown}
          >
            {#each minutes as minute, i (minute)}
              {@const itemY = i * ITEM_HEIGHT - minuteWheel.offset + CENTER_Y}
              <div
                class="absolute inset-x-0 flex items-center justify-center text-base tabular-nums
                  {i === minuteWheel.selectedIndex
                  ? 'font-semibold text-[var(--color-primary)]'
                  : 'text-base-content'}"
                style="height: {ITEM_HEIGHT}px; transform: translateY({itemY}px) scale({getItemScale(
                  itemY,
                )}); opacity: {getItemOpacity(itemY)};"
                class:wheel-item-snapping={minuteWheel.isSnapping}
              >
                {String(minute).padStart(2, "0")}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Desktop: Dropdown selectors -->
    <div class="flex items-center justify-center gap-3">
      <!-- Hour Selector -->
      <div class="flex flex-col items-center gap-1">
        <label
          class="text-[10px] font-medium text-[var(--color-text-muted)]"
          for="time-hour-select">時</label
        >
        <select
          id="time-hour-select"
          class="select-bordered select w-20 bg-base-100 select-sm text-sm focus:border-[var(--color-primary)] focus:outline-none"
          value={currentHour}
          onchange={handleHourChange}
        >
          {#each hours as hour (hour)}
            <option value={hour}>{String(hour).padStart(2, "0")}</option>
          {/each}
        </select>
      </div>

      <span class="text-lg font-medium text-base-content/60">:</span>

      <!-- Minute Selector -->
      <div class="flex flex-col items-center gap-1">
        <label
          class="text-[10px] font-medium text-[var(--color-text-muted)]"
          for="time-minute-select">分</label
        >
        <select
          id="time-minute-select"
          class="select-bordered select w-20 bg-base-100 select-sm text-sm focus:border-[var(--color-primary)] focus:outline-none"
          value={currentMinute}
          onchange={handleMinuteChange}
        >
          {#each minutes as minute (minute)}
            <option value={minute}>{String(minute).padStart(2, "0")}</option>
          {/each}
        </select>
      </div>
    </div>
  {/if}
</div>

<style>
  .wheel-container {
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 25%,
      black 75%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 25%,
      black 75%,
      transparent 100%
    );
    user-select: none;
    -webkit-user-select: none;
  }

  .wheel-item-snapping {
    transition:
      transform 200ms ease-out,
      opacity 200ms ease-out;
  }
</style>
