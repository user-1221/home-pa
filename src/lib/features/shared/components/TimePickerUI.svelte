<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, onDestroy, tick } from "svelte";

  interface Props {
    value: string; // HH:mm format
    onchange?: () => void; // Called when time changes
  }

  let { value = $bindable(""), onchange }: Props = $props();

  // Parse current time or default to 00:00
  let currentHour = $state(0);
  let currentMinute = $state(0);

  // Mobile detection (screen width < 768px)
  let isMobile = $state(false);

  // Initialize from value
  $effect(() => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      currentHour = h ?? 0;
      currentMinute = m ?? 0;
    }
  });

  // Generate hour options (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  // Generate minute options (0-59 for desktop, 0-59 for mobile scroll)
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  // Mobile scroll picker refs
  let hourScrollRef: HTMLDivElement | undefined = $state();
  let minuteScrollRef: HTMLDivElement | undefined = $state();

  function handleHourChange(e: Event & { currentTarget: HTMLSelectElement }) {
    currentHour = Number(e.currentTarget.value);
    updateTime();
  }

  function handleMinuteChange(e: Event & { currentTarget: HTMLSelectElement }) {
    currentMinute = Number(e.currentTarget.value);
    updateTime();
  }

  function updateTime() {
    const newValue = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
    value = newValue;
    onchange?.();
  }

  // Mobile scroll handlers
  function handleHourScroll(e: Event & { currentTarget: HTMLDivElement }) {
    const scrollTop = e.currentTarget.scrollTop;
    const itemHeight = 40; // Height of each option
    const spacerHeight = 96; // Height of top spacer (calc(50%-20px) = 96px when container is 128px)
    const adjustedScroll = scrollTop - spacerHeight;
    const selectedIndex = Math.round(adjustedScroll / itemHeight);
    const newHour = Math.max(0, Math.min(23, selectedIndex));
    if (newHour !== currentHour) {
      currentHour = newHour;
      updateTime();
    }
  }

  function handleMinuteScroll(e: Event & { currentTarget: HTMLDivElement }) {
    const scrollTop = e.currentTarget.scrollTop;
    const itemHeight = 40; // Height of each option
    const spacerHeight = 96; // Height of top spacer
    const adjustedScroll = scrollTop - spacerHeight;
    const selectedIndex = Math.round(adjustedScroll / itemHeight);
    const newMinute = Math.max(0, Math.min(59, selectedIndex));
    if (newMinute !== currentMinute) {
      currentMinute = newMinute;
      updateTime();
    }
  }

  // Sync scroll position when value changes
  $effect(() => {
    if (isMobile && hourScrollRef) {
      tick().then(() => {
        if (hourScrollRef) {
          const itemHeight = 40;
          const spacerHeight = 96;
          hourScrollRef.scrollTop = spacerHeight + currentHour * itemHeight;
        }
      });
    }
  });

  $effect(() => {
    if (isMobile && minuteScrollRef) {
      tick().then(() => {
        if (minuteScrollRef) {
          const itemHeight = 40;
          const spacerHeight = 96;
          minuteScrollRef.scrollTop = spacerHeight + currentMinute * itemHeight;
        }
      });
    }
  });

  // Check mobile on mount and resize
  if (browser) {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    onMount(() => {
      checkMobile();
      window.addEventListener("resize", checkMobile);
    });
    onDestroy(() => {
      window.removeEventListener("resize", checkMobile);
    });
  }
</script>

<div class="rounded-box border border-base-300 bg-base-200 p-4">
  <div
    class="mb-3 text-center text-xs font-medium text-[var(--color-text-secondary)]"
  >
    時間を選択
  </div>

  {#if isMobile}
    <!-- Mobile: Scrollable picker -->
    <div class="flex items-center justify-center gap-2">
      <!-- Hour Scroll Picker -->
      <div class="relative flex flex-col items-center gap-1">
        <label class="text-[10px] font-medium text-[var(--color-text-muted)]"
          >時</label
        >
        <div class="relative">
          <!-- Selection highlight overlay -->
          <div
            class="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 rounded border border-[var(--color-primary)] bg-[var(--color-primary-100)]/30"
          ></div>
          <div
            bind:this={hourScrollRef}
            class="scrollbar-hide relative h-32 w-16 snap-y snap-mandatory overflow-y-scroll overscroll-contain"
            onscroll={handleHourScroll}
          >
            <!-- Spacer for centering -->
            <div class="h-[calc(50%-20px)]"></div>
            {#each hours as hour}
              <div
                class="flex h-10 snap-center items-center justify-center text-sm {hour ===
                currentHour
                  ? 'font-semibold text-[var(--color-primary)]'
                  : 'text-base-content/60'}"
              >
                {String(hour).padStart(2, "0")}
              </div>
            {/each}
            <!-- Spacer for centering -->
            <div class="h-[calc(50%-20px)]"></div>
          </div>
        </div>
      </div>

      <span class="text-lg font-medium text-base-content/60">:</span>

      <!-- Minute Scroll Picker -->
      <div class="relative flex flex-col items-center gap-1">
        <label class="text-[10px] font-medium text-[var(--color-text-muted)]"
          >分</label
        >
        <div class="relative">
          <!-- Selection highlight overlay -->
          <div
            class="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 rounded border border-[var(--color-primary)] bg-[var(--color-primary-100)]/30"
          ></div>
          <div
            bind:this={minuteScrollRef}
            class="scrollbar-hide relative h-32 w-16 snap-y snap-mandatory overflow-y-scroll overscroll-contain"
            onscroll={handleMinuteScroll}
          >
            <!-- Spacer for centering -->
            <div class="h-[calc(50%-20px)]"></div>
            {#each minutes as minute}
              <div
                class="flex h-10 snap-center items-center justify-center text-sm {minute ===
                currentMinute
                  ? 'font-semibold text-[var(--color-primary)]'
                  : 'text-base-content/60'}"
              >
                {String(minute).padStart(2, "0")}
              </div>
            {/each}
            <!-- Spacer for centering -->
            <div class="h-[calc(50%-20px)]"></div>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Desktop: Dropdown selectors with 1-minute increments -->
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
          {#each hours as hour}
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
          {#each minutes as minute}
            <option value={minute}>{String(minute).padStart(2, "0")}</option>
          {/each}
        </select>
      </div>
    </div>
  {/if}
</div>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
