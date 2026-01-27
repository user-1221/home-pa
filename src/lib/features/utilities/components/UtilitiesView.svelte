<script lang="ts">
  /**
   * UtilitiesView Component
   *
   * Main view for mini apps and utilities.
   * Shows grid of mini app icons that open their respective views.
   * Settings icon in top-right opens settings popup.
   */

  import { TransitView } from "$lib/features/transit/components/index.ts";
  import { ProgressMemoView } from "$lib/features/progress-memo/components/index.ts";
  import {
    PomodoroView,
    PixelTimerView,
  } from "$lib/features/focus/components/index.ts";
  import SettingsPopup from "./SettingsPopup.svelte";
  import PomodoroIcon from "./PomodoroIcon.svelte";
  import TransitIcon from "./TransitIcon.svelte";
  import ProgressMemoIcon from "./ProgressMemoIcon.svelte";
  import PixelTimerIcon from "./PixelTimerIcon.svelte";
  import SettingsIcon from "./SettingsIcon.svelte";

  // Mini app definitions
  interface MiniApp {
    id: string;
    name: string;
    description: string;
    color: string;
  }

  const miniApps: MiniApp[] = [
    {
      id: "pomodoro",
      name: "Pomodoro",
      description: "Focus timer",
      color: "var(--color-error)",
    },
    {
      id: "pixel-timer",
      name: "Pixel Timer",
      description: "ドット絵タイマー",
      color: "var(--color-warning)",
    },
    {
      id: "transit",
      name: "Transit",
      description: "Train & bus schedules",
      color: "var(--color-primary)",
    },
    {
      id: "progress-memo",
      name: "Progress Memo",
      description: "Track goals & habits",
      color: "var(--color-success)",
    },
  ];

  // State
  let showSettings = $state(false);
  let activeMiniApp = $state<string | null>(null);

  function openMiniApp(id: string) {
    activeMiniApp = id;
  }

  function closeMiniApp() {
    activeMiniApp = null;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeMiniApp();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && activeMiniApp) {
      closeMiniApp();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="flex h-full flex-1 flex-col overflow-y-auto bg-base-200/60 p-3 backdrop-blur-sm md:p-5"
>
  <!-- Header with Settings Icon -->
  <div class="mb-6 navbar min-h-14 border-b border-base-300 px-0 md:min-h-20">
    <div class="flex-1">
      <div class="flex flex-col gap-1">
        <h2 class="text-base font-normal tracking-tight md:text-xl">
          Utilities
        </h2>
        <p class="text-sm text-[var(--color-text-secondary)] md:text-base">
          Mini apps and tools to enhance your workflow
        </p>
      </div>
    </div>
    <div class="flex-none">
      <button
        class="btn btn-circle btn-ghost btn-sm md:btn-md"
        onclick={() => (showSettings = true)}
        aria-label="Settings"
      >
        <SettingsIcon />
      </button>
    </div>
  </div>

  <!-- Mini Apps Grid -->
  <div class="grid grid-cols-3 gap-5">
    {#each miniApps as app (app.id)}
      <div class="flex flex-col items-center gap-2">
        <button
          class="group relative aspect-square w-20 overflow-hidden rounded-xl border border-base-300/60 bg-base-100 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-base-300 hover:shadow-md active:scale-[0.98]"
          onclick={() => openMiniApp(app.id)}
        >
          <!-- Subtle gradient overlay on hover -->
          <div
            class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style="background: linear-gradient(135deg, color-mix(in srgb, {app.color} 6%, transparent), transparent)"
          ></div>

          <div
            class="relative flex h-full flex-col items-center justify-center"
          >
            {#if app.id === "pomodoro"}
              <PomodoroIcon
                class="h-10 w-10 drop-shadow-sm"
                style="color: {app.color};"
              />
            {:else if app.id === "pixel-timer"}
              <PixelTimerIcon
                class="h-10 w-10 drop-shadow-sm"
                style="color: {app.color};"
              />
            {:else if app.id === "transit"}
              <TransitIcon
                class="h-10 w-10 drop-shadow-sm"
                style="color: {app.color};"
              />
            {:else if app.id === "progress-memo"}
              <ProgressMemoIcon
                class="h-10 w-10 drop-shadow-sm"
                style="color: {app.color};"
              />
            {/if}
          </div>
        </button>
        <!-- App name -->
        <span class="text-sm font-medium tracking-tight text-base-content"
          >{app.name}</span
        >
      </div>
    {/each}
  </div>
</div>

<!-- Settings Popup -->
<SettingsPopup open={showSettings} onClose={() => (showSettings = false)} />

<!-- Mini App Modal -->
{#if activeMiniApp}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2100] md:modal-middle"
    role="button"
    tabindex="-1"
    aria-label="Close mini app"
    onclick={handleBackdropClick}
  >
    <div
      class="modal-box h-full w-full max-w-2xl p-0 md:h-auto md:max-h-[80vh]"
    >
      {#if activeMiniApp === "pomodoro"}
        <PomodoroView onClose={closeMiniApp} />
      {:else if activeMiniApp === "pixel-timer"}
        <PixelTimerView onClose={closeMiniApp} />
      {:else if activeMiniApp === "transit"}
        <TransitView onClose={closeMiniApp} />
      {:else if activeMiniApp === "progress-memo"}
        <ProgressMemoView onClose={closeMiniApp} />
      {/if}
    </div>
    <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
  </div>
{/if}
