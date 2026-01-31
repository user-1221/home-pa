<script lang="ts">
  interface Props {
    value: string; // HH:mm format
    onchange?: () => void; // Called when time changes
  }

  let { value = $bindable(""), onchange }: Props = $props();

  // Parse current time or default to 00:00
  let currentHour = $state(0);
  let currentMinute = $state(0);

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
  // Generate minute options (0, 15, 30, 45 for 15-min intervals)
  const minutes = Array.from({ length: 4 }, (_, i) => i * 15);

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
</script>

<div class="rounded-box border border-base-300 bg-base-200 p-4">
  <div
    class="mb-3 text-center text-xs font-medium text-[var(--color-text-secondary)]"
  >
    時間を選択
  </div>
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
</div>
