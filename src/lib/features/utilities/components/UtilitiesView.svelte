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
  import { PomodoroView } from "$lib/features/focus/components/index.ts";
  import SettingsPopup from "./SettingsPopup.svelte";

  // Mini app definitions
  interface MiniApp {
    id: string;
    name: string;
    icon: string;
    description: string;
    color: string;
  }

  const miniApps: MiniApp[] = [
    {
      id: "pomodoro",
      name: "Pomodoro",
      icon: "🍅",
      description: "Focus timer",
      color: "var(--color-error)",
    },
    {
      id: "transit",
      name: "Transit",
      icon: "🚃",
      description: "Train & bus schedules",
      color: "var(--color-primary)",
    },
    {
      id: "progress-memo",
      name: "Progress Memo",
      icon: "📊",
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
        ⚙️
      </button>
    </div>
  </div>

  <!-- Mini Apps Grid -->
  <div class="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4">
    {#each miniApps as app (app.id)}
      <button
        class="group relative overflow-hidden rounded-xl border border-base-300/60 bg-base-100 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-base-300 hover:shadow-md active:scale-[0.98]"
        onclick={() => openMiniApp(app.id)}
      >
        <!-- Subtle gradient overlay on hover -->
        <div
          class="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style="background: linear-gradient(135deg, color-mix(in srgb, {app.color} 6%, transparent), transparent)"
        ></div>

        <div class="relative flex flex-col items-center gap-4 text-center">
          <!-- Icon container with refined styling -->
          <div
            class="relative flex h-14 w-14 items-center justify-center rounded-xl text-2xl transition-all duration-200 group-hover:scale-105"
            style="background: linear-gradient(145deg, color-mix(in srgb, {app.color} 12%, white), color-mix(in srgb, {app.color} 18%, white)); box-shadow: 0 2px 8px color-mix(in srgb, {app.color} 15%, transparent), inset 0 1px 0 rgba(255,255,255,0.5);"
          >
            <span class="drop-shadow-sm">{app.icon}</span>
          </div>

          <!-- Text content -->
          <div class="flex flex-col gap-0.5">
            <span class="text-sm font-medium tracking-tight text-base-content"
              >{app.name}</span
            >
            <span class="text-xs text-[var(--color-text-secondary)]"
              >{app.description}</span
            >
          </div>
        </div>
      </button>
    {/each}

    <!-- Placeholder for future apps -->
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-base-300/50 bg-transparent p-5 opacity-40"
    >
      <div
        class="flex h-14 w-14 items-center justify-center rounded-xl bg-base-200/50"
      >
        <span class="text-xl text-[var(--color-text-muted)]">+</span>
      </div>
      <span class="text-xs text-[var(--color-text-muted)]">More coming</span>
    </div>
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
      {:else if activeMiniApp === "transit"}
        <TransitView onClose={closeMiniApp} />
      {:else if activeMiniApp === "progress-memo"}
        <ProgressMemoView onClose={closeMiniApp} />
      {/if}
    </div>
    <div class="modal-backdrop bg-base-content/40 backdrop-blur-sm"></div>
  </div>
{/if}
