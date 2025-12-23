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
      color: "var(--color-success-500)",
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

<div class="mx-auto flex h-full flex-1 flex-col overflow-y-auto bg-base-200/60 p-3 backdrop-blur-sm md:max-w-screen-xl md:p-5">
  <!-- Header with Settings Icon -->
  <div class="navbar mb-6 min-h-14 border-b border-base-300 px-0 md:min-h-20">
    <div class="flex-1">
      <div class="flex flex-col gap-1">
        <h2 class="text-base font-normal tracking-tight md:text-xl">Utilities</h2>
        <p class="text-sm text-base-content/60 md:text-base">
          Mini apps and tools to enhance your workflow
        </p>
      </div>
    </div>
    <div class="flex-none">
      <button
        class="btn btn-ghost btn-circle btn-sm md:btn-md"
        onclick={() => (showSettings = true)}
        aria-label="Settings"
      >
        ⚙️
      </button>
    </div>
  </div>

  <!-- Mini Apps Grid -->
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
    {#each miniApps as app (app.id)}
      <button
        class="card card-sm group bg-base-100 shadow-sm transition-all duration-200 hover:shadow-md active:scale-95"
        onclick={() => openMiniApp(app.id)}
      >
        <div class="card-body items-center gap-3 p-6 text-center">
          <div
            class="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl transition-transform duration-200 group-hover:scale-110"
            style="background-color: color-mix(in srgb, {app.color} 15%, transparent)"
          >
            {app.icon}
          </div>
          <div>
            <span class="block text-sm font-medium">{app.name}</span>
            <span class="mt-1 block text-xs text-base-content/50">{app.description}</span>
          </div>
        </div>
      </button>
    {/each}

    <!-- Placeholder for future apps -->
    <div class="card card-sm border-2 border-dashed border-base-300 bg-transparent opacity-50">
      <div class="card-body items-center justify-center gap-2 p-6 text-center">
        <span class="text-2xl text-base-content/50">+</span>
        <span class="text-xs text-base-content/50">More coming</span>
      </div>
    </div>
  </div>
</div>

<!-- Settings Popup -->
<SettingsPopup open={showSettings} onClose={() => (showSettings = false)} />

<!-- Mini App Modal -->
{#if activeMiniApp}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal modal-open modal-bottom z-[2100] md:modal-middle"
    role="button"
    tabindex="-1"
    aria-label="Close mini app"
    onclick={handleBackdropClick}
  >
    <div class="modal-box max-h-[90vh] w-full max-w-2xl p-0 md:max-h-[80vh]">
      {#if activeMiniApp === "transit"}
        <TransitView onClose={closeMiniApp} />
      {:else if activeMiniApp === "progress-memo"}
        <ProgressMemoView onClose={closeMiniApp} />
      {/if}
    </div>
    <div class="modal-backdrop bg-black/40 backdrop-blur-sm"></div>
  </div>
{/if}
