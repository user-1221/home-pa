<script lang="ts">
  /**
   * StartNowButton Component
   *
   * Shows a "Start Now" button for accepted suggestions that are currently active
   * (current time is between start and end time).
   *
   * When clicked, starts tracking the task via focusState.
   * When already tracking this task, shows a "Working..." indicator.
   */

  import { focusState } from "../state/index.ts";

  interface Props {
    memoId: string;
    title: string;
    endTime: string;
    mode?: "normal" | "pomodoro";
  }

  let { memoId, title, endTime, mode = "normal" }: Props = $props();

  // Check if this task is currently being tracked
  let isTracking = $derived(
    focusState.activeSession?.memoId === memoId && focusState.isActive,
  );

  function handleStart() {
    if (isTracking) return;

    if (mode === "pomodoro") {
      focusState.startPomodoro(memoId, title, endTime);
    } else {
      focusState.startNormal(memoId, title, endTime);
    }
  }
</script>

{#if isTracking}
  <!-- Working indicator -->
  <div
    class="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-primary"
  >
    <span class="relative flex h-2 w-2">
      <span
        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"
      ></span>
      <span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
    </span>
    <span class="text-sm font-medium">集中中...</span>
  </div>
{:else}
  <button
    class="flex h-9 items-center gap-2 rounded-lg bg-primary/10 px-3 text-primary transition-all duration-200 hover:bg-primary hover:text-primary-content active:scale-95"
    onclick={handleStart}
    title="今すぐ開始"
    aria-label="今すぐ開始"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
    <span class="text-sm font-medium">今すぐ開始</span>
  </button>
{/if}
