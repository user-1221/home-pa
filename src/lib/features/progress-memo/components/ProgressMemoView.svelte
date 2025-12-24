<script lang="ts">
  /**
   * ProgressMemoView Component
   *
   * Mini app for tracking progress on goals and habits.
   * Currently UI-only, API integration planned.
   */

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  // Mock data for UI
  interface Goal {
    id: string;
    title: string;
    progress: number;
    target: number;
    unit: string;
    streak: number;
    lastUpdated: string;
    color: string;
  }

  const goals = $state<Goal[]>([
    {
      id: "1",
      title: "Read books",
      progress: 12,
      target: 24,
      unit: "books",
      streak: 5,
      lastUpdated: "Today",
      color: "var(--color-primary)",
    },
    {
      id: "2",
      title: "Exercise",
      progress: 18,
      target: 30,
      unit: "sessions",
      streak: 3,
      lastUpdated: "Yesterday",
      color: "var(--color-success-500)",
    },
    {
      id: "3",
      title: "Learn Japanese",
      progress: 45,
      target: 100,
      unit: "lessons",
      streak: 12,
      lastUpdated: "Today",
      color: "var(--color-warning-500)",
    },
  ]);

  const quickLogs = $state([
    { id: "q1", title: "Morning routine", emoji: "🌅", count: 28 },
    { id: "q2", title: "Water intake", emoji: "💧", count: 6 },
    { id: "q3", title: "Meditation", emoji: "🧘", count: 15 },
  ]);

  function getProgressPercent(progress: number, target: number): number {
    return Math.min(100, Math.round((progress / target) * 100));
  }

  function incrementQuickLog(id: string) {
    const log = quickLogs.find((l) => l.id === id);
    if (log) {
      log.count++;
    }
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-base-300 p-4">
    <div class="flex items-center gap-3">
      <span class="text-2xl">📊</span>
      <h2 class="m-0 text-xl font-medium text-base-content">Progress Memo</h2>
    </div>
    {#if onClose}
      <button
        class="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-base-content/70 transition-colors duration-200 hover:bg-base-200 hover:text-base-content"
        onclick={onClose}
        aria-label="Close"
      >
        ×
      </button>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    <!-- Quick Log Section -->
    <section class="mb-6">
      <h3 class="mb-3 text-sm font-medium text-base-content/70">Quick Log</h3>
      <div class="grid grid-cols-3 gap-3">
        {#each quickLogs as log (log.id)}
          <button
            class="flex flex-col items-center gap-2 rounded-xl border border-base-300 bg-base-100 p-4 transition-all duration-200 hover:border-primary hover:bg-primary/10 active:scale-95"
            onclick={() => incrementQuickLog(log.id)}
          >
            <span class="text-2xl">{log.emoji}</span>
            <span class="text-xs text-base-content/70">{log.title}</span>
            <span class="text-lg font-semibold text-base-content"
              >{log.count}</span
            >
          </button>
        {/each}
      </div>
    </section>

    <!-- Goals Section -->
    <section class="mb-6">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-medium text-base-content/70">Goals</h3>
        <button
          class="rounded-lg px-3 py-1.5 text-xs font-medium text-primary transition-colors duration-200 hover:bg-primary/10"
        >
          + Add Goal
        </button>
      </div>

      <div class="flex flex-col gap-3">
        {#each goals as goal (goal.id)}
          <div class="rounded-xl border border-base-300 bg-base-100 p-4">
            <div class="mb-3 flex items-start justify-between">
              <div>
                <span class="text-base font-medium text-base-content"
                  >{goal.title}</span
                >
                <div class="mt-1 flex items-center gap-2">
                  <span class="text-xs text-base-content/50"
                    >🔥 {goal.streak} day streak</span
                  >
                  <span class="text-xs text-base-content/50"
                    >• {goal.lastUpdated}</span
                  >
                </div>
              </div>
              <span class="text-lg font-semibold" style="color: {goal.color}">
                {getProgressPercent(goal.progress, goal.target)}%
              </span>
            </div>

            <!-- Progress Bar -->
            <div
              class="mb-2 h-2 w-full overflow-hidden rounded-full bg-base-200"
            >
              <div
                class="h-full rounded-full transition-all duration-300"
                style="width: {getProgressPercent(
                  goal.progress,
                  goal.target,
                )}%; background-color: {goal.color}"
              ></div>
            </div>

            <div
              class="flex items-center justify-between text-xs text-base-content/50"
            >
              <span>{goal.progress} / {goal.target} {goal.unit}</span>
              <button
                class="rounded-lg bg-base-200 px-3 py-1.5 font-medium text-base-content/70 transition-colors duration-200 hover:bg-primary/10 hover:text-primary"
              >
                + Log
              </button>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Stats Overview -->
    <section>
      <h3 class="mb-3 text-sm font-medium text-base-content/70">This Week</h3>
      <div
        class="grid grid-cols-2 gap-3 rounded-xl border border-base-300 bg-base-200 p-4"
      >
        <div class="text-center">
          <div class="text-2xl font-semibold text-base-content">23</div>
          <div class="text-xs text-base-content/50">Activities</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-semibold text-success">85%</div>
          <div class="text-xs text-base-content/50">Completion</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-semibold text-primary">12</div>
          <div class="text-xs text-base-content/50">Best Streak</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-semibold text-warning">3</div>
          <div class="text-xs text-base-content/50">Goals Active</div>
        </div>
      </div>
    </section>

    <!-- API Notice -->
    <div
      class="mt-6 rounded-xl border border-dashed border-base-300 bg-base-200 p-4 text-center"
    >
      <p class="text-sm text-base-content/50">
        🚧 Data persistence coming soon
      </p>
      <p class="mt-1 text-xs text-base-content/50">
        Currently showing mock data
      </p>
    </div>
  </div>
</div>
