<script lang="ts">
  import { settingsState } from "$lib/bootstrap/settings.svelte.ts";
  import { getUnifiedGapState } from "$lib/features/assistant/state";
  import { toastState } from "$lib/bootstrap/toast.svelte.ts";

  const unifiedGapState = getUnifiedGapState();

  // Local state for optimistic updates
  let startTime = $state(settingsState.activeStartTime);
  let endTime = $state(settingsState.activeEndTime);
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Sync with settings state when it changes externally
  $effect(() => {
    startTime = settingsState.activeStartTime;
    endTime = settingsState.activeEndTime;
  });

  function handleStartChange(e: Event & { currentTarget: HTMLInputElement }) {
    const value = e.currentTarget.value;
    startTime = value;
    settingsState.setActiveStartTime(value);
    scheduleAutoSave();
  }

  function handleEndChange(e: Event & { currentTarget: HTMLInputElement }) {
    const value = e.currentTarget.value;
    endTime = value;
    settingsState.setActiveEndTime(value);
    scheduleAutoSave();
  }

  function scheduleAutoSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await settingsState.save();
        // Force gap recalculation
        unifiedGapState.forceRegeneration();
      } catch {
        toastState.error("設定の保存に失敗しました");
      }
    }, 800); // Debounce 800ms
  }
</script>

<div
  class="flex min-h-10 flex-shrink-0 items-center justify-center gap-2 px-3 md:px-5"
>
  <span class="text-xs text-base-content/60">活動時間</span>
  <input
    type="time"
    value={startTime}
    onchange={handleStartChange}
    class="input input-xs w-24 border-base-300/50 bg-transparent text-xs focus:border-primary focus:outline-none"
  />
  <span class="text-xs text-base-content/40">-</span>
  <input
    type="time"
    value={endTime}
    onchange={handleEndChange}
    class="input input-xs w-24 border-base-300/50 bg-transparent text-xs focus:border-primary focus:outline-none"
  />
  {#if settingsState.isSaving}
    <span class="loading loading-xs loading-spinner text-primary"></span>
  {/if}
</div>
