<script lang="ts">
  /**
   * TransitView Component
   *
   * Mini app for viewing transit schedules and routes.
   * Shows departure time based on event importance (high=20min, medium=10min, low=5min buffer).
   * Displays detailed route with train lines, transfers, and walking segments.
   */

  import { onMount } from "svelte";
  import { transitState } from "../state/transit.svelte.ts";
  import type { Route, RouteSection } from "../services/transit-api.remote.ts";

  interface Props {
    onClose?: () => void;
  }

  const { onClose }: Props = $props();

  // Local state
  let isInitialized = $state(false);
  let showLeaveNowRoute = $state(false);
  let selectedRoute = $state<Route | null>(null);

  // Derived state from transitState
  const transitInfo = $derived(transitState.transitInfo);
  const isLoadingRoutes = $derived(transitState.isLoadingRoutes);
  const isLoadingLocation = $derived(transitState.isLoadingLocation);
  const routeError = $derived(transitState.routeError);
  const locationError = $derived(transitState.locationError);
  const userLocation = $derived(transitState.userLocation);

  // Initialize on mount
  onMount(async () => {
    console.log("[TransitView] Mounted, loading transit info...");
    console.log("[TransitView] navigator.geolocation available:", !!navigator?.geolocation);
    await transitState.loadNextEventTransit();
    isInitialized = true;
    console.log("[TransitView] Initialization complete, locationError:", transitState.locationError);

    // Auto-select the recommended route
    if (transitState.transitInfo?.recommendedDeparture?.route) {
      selectedRoute = transitState.transitInfo.recommendedDeparture.route;
    }
  });

  // ============================================================================
  // Event Handlers
  // ============================================================================

  async function handleLeaveNow() {
    showLeaveNowRoute = true;
    await transitState.refreshRoutes();
    if (transitState.transitInfo?.leaveNowRoute) {
      selectedRoute = transitState.transitInfo.leaveNowRoute;
    }
  }

  async function handleRefresh() {
    await transitState.refreshRoutes();
    if (transitState.transitInfo?.recommendedDeparture?.route) {
      selectedRoute = transitState.transitInfo.recommendedDeparture.route;
    }
  }

  function selectRecommendedRoute() {
    if (transitInfo?.recommendedDeparture?.route) {
      selectedRoute = transitInfo.recommendedDeparture.route;
      showLeaveNowRoute = false;
    }
  }

  function selectLeaveNowRoute() {
    if (transitInfo?.leaveNowRoute) {
      selectedRoute = transitInfo.leaveNowRoute;
      showLeaveNowRoute = true;
    }
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function formatEventTime(date: Date): string {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const time = formatTime(date);
    return `${month}/${day} ${time}`;
  }

  function getTimeUntilEvent(eventStart: Date): string {
    const now = new Date();
    const diffMs = eventStart.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 0) return "過去のイベント";
    if (diffMinutes < 60) return `あと${diffMinutes}分`;
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    if (hours < 24) return `あと${hours}時間${mins > 0 ? `${mins}分` : ""}`;
    const days = Math.floor(hours / 24);
    return `あと${days}日`;
  }

  function getImportanceLabel(importance: string): string {
    switch (importance) {
      case "high":
        return "🔴 重要";
      case "medium":
        return "🟡 普通";
      case "low":
        return "🟢 低";
      default:
        return "普通";
    }
  }

  function getImportanceColor(importance: string): string {
    switch (importance) {
      case "high":
        return "text-error";
      case "medium":
        return "text-warning";
      case "low":
        return "text-success";
      default:
        return "text-base-content";
    }
  }

  function getMoveIcon(move: string | undefined): string {
    switch (move) {
      case "walk":
        return "🚶";
      case "local_train":
      case "rapid_train":
      case "express_train":
      case "limited_express":
        return "🚃";
      case "bus":
        return "🚌";
      case "shinkansen":
        return "🚄";
      default:
        return "🚃";
    }
  }

  function getMoveLabel(section: RouteSection): string {
    if (section.move === "walk") {
      return `徒歩 ${section.distance}m`;
    }
    return section.transport?.name ?? section.line_name ?? "移動";
  }

  function isPointSection(section: RouteSection): boolean {
    return section.type === "point";
  }

  function isMoveSection(section: RouteSection): boolean {
    return section.type === "move";
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-base-300 p-4">
    <div class="flex items-center gap-3">
      <span class="text-2xl">🚃</span>
      <h2 class="m-0 text-xl font-medium text-base-content">Transit</h2>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="btn btn-ghost btn-sm"
        onclick={handleRefresh}
        disabled={isLoadingRoutes || isLoadingLocation}
        aria-label="Refresh"
      >
        <span class={isLoadingRoutes || isLoadingLocation ? "animate-spin" : ""}>🔄</span>
      </button>
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
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    <!-- Location Status -->
    {#if locationError}
      <div class="alert alert-warning mb-4 flex-col items-start gap-2">
        <div class="flex items-center gap-2">
          <span>📍</span>
          <span class="font-medium">位置情報エラー</span>
        </div>
        <span class="text-sm">{locationError}</span>
        <div class="mt-2 text-xs opacity-70">
          <p>• ブラウザのアドレスバーで🔒アイコンをクリック</p>
          <p>• 「位置情報」を「許可」に変更</p>
          <p>• ページを再読み込み</p>
        </div>
        <button class="btn btn-sm btn-ghost mt-2" onclick={handleRefresh}>
          🔄 再試行
        </button>
      </div>
    {:else if userLocation}
      <div class="mb-4 flex items-center gap-2 text-xs text-base-content/50">
        <span>📍</span>
        <span>現在地取得済み</span>
        <span class="text-base-content/30">
          (精度: {userLocation.accuracy ? `${Math.round(userLocation.accuracy)}m` : "不明"})
        </span>
      </div>
    {/if}

    <!-- Loading State -->
    {#if !isInitialized || isLoadingRoutes}
      <div class="flex flex-col items-center justify-center py-12">
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <p class="mt-4 text-sm text-base-content/70">
          {isLoadingLocation ? "現在地を取得中..." : "経路を検索中..."}
        </p>
      </div>
    {:else if routeError}
      <!-- Error State -->
      <div class="alert alert-error mb-4">
        <span>⚠️</span>
        <span>{routeError}</span>
      </div>
    {:else if !transitInfo}
      <!-- No Event State -->
      <div class="rounded-xl border border-dashed border-base-300 bg-base-200 p-6 text-center">
        <span class="text-4xl">📅</span>
        <p class="mt-4 text-base-content/70">
          場所が設定された予定がありません
        </p>
        <p class="mt-1 text-sm text-base-content/50">
          カレンダーで予定に住所を追加してください
        </p>
      </div>
    {:else}
      <!-- Next Event Info -->
      <section class="mb-6">
        <div class="rounded-xl border border-base-300 bg-base-100 p-4">
          <div class="mb-2 flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-medium text-base-content">
                  {transitInfo.event.title}
                </h3>
                <span class="text-xs {getImportanceColor(transitInfo.importance)}">
                  {getImportanceLabel(transitInfo.importance)}
                </span>
              </div>
              <p class="mt-1 text-sm text-base-content/70">
                📍 {transitInfo.eventLocation}
              </p>
            </div>
            <div class="text-right">
              <div class="text-sm font-medium text-primary">
                {formatEventTime(transitInfo.eventStart)}
              </div>
              <div class="text-xs text-base-content/50">
                {getTimeUntilEvent(transitInfo.eventStart)}
              </div>
            </div>
          </div>
          <div class="mt-2 rounded-lg bg-base-200 p-2 text-xs text-base-content/70">
            ⏰ {transitInfo.bufferMinutes}分前到着を推奨（{transitInfo.importance === "high" ? "重要な予定" : transitInfo.importance === "low" ? "余裕のある予定" : "通常の予定"}）
          </div>
        </div>
      </section>

      <!-- Route Selection Tabs -->
      <section class="mb-4">
        <div class="flex gap-2">
          <button
            class="btn btn-sm flex-1 {!showLeaveNowRoute && transitInfo.recommendedDeparture ? 'btn-primary' : 'btn-ghost'}"
            onclick={selectRecommendedRoute}
            disabled={!transitInfo.recommendedDeparture}
          >
            🎯 推奨出発
          </button>
          <button
            class="btn btn-sm flex-1 {showLeaveNowRoute ? 'btn-primary' : 'btn-ghost'}"
            onclick={handleLeaveNow}
            disabled={isLoadingRoutes}
          >
            🚀 今すぐ出発
          </button>
        </div>
      </section>

      <!-- Recommended Departure Info -->
      {#if !showLeaveNowRoute && transitInfo.recommendedDeparture?.route}
        {@const dep = transitInfo.recommendedDeparture}
        <section class="mb-6">
          <div class="rounded-xl border-2 border-primary bg-primary/10 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-base-content/70">出発時刻</div>
                <div class="text-2xl font-bold text-primary">
                  {formatTime(dep.departureTime)}
                </div>
              </div>
              <div class="text-center">
                <div class="text-sm text-base-content/50">→</div>
                <div class="text-lg font-medium">{dep.route.summary.move.time}分</div>
              </div>
              <div class="text-right">
                <div class="text-sm text-base-content/70">到着時刻</div>
                <div class="text-xl font-semibold">
                  {formatTime(dep.arrivalTime)}
                </div>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-3 border-t border-primary/30 pt-3 text-sm">
              <span>🚶 {dep.route.summary.move.walk_distance}m</span>
              <span>🔄 {dep.route.summary.move.transit_count}回乗換</span>
              {#if dep.route.summary.move.fare?.unit_48}
                <span>💳 ¥{dep.route.summary.move.fare.unit_48}</span>
              {:else if dep.route.summary.move.fare?.unit_0}
                <span>💴 ¥{dep.route.summary.move.fare.unit_0}</span>
              {/if}
            </div>
          </div>
        </section>
      {:else if !showLeaveNowRoute}
        <section class="mb-6">
          <div class="rounded-xl border border-warning bg-warning/10 p-4 text-sm text-warning">
            推奨出発時刻は既に過ぎています
          </div>
        </section>
      {/if}

      <!-- Leave Now Info -->
      {#if showLeaveNowRoute && transitInfo.leaveNowRoute}
        {@const route = transitInfo.leaveNowRoute}
        <section class="mb-6">
          <div class="rounded-xl border-2 border-success bg-success/10 p-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm text-base-content/70">今すぐ出発</div>
                <div class="text-2xl font-bold text-success">
                  {formatTime(new Date(route.summary.move.from_time))}
                </div>
              </div>
              <div class="text-center">
                <div class="text-sm text-base-content/50">→</div>
                <div class="text-lg font-medium">{route.summary.move.time}分</div>
              </div>
              <div class="text-right">
                <div class="text-sm text-base-content/70">到着予定</div>
                <div class="text-xl font-semibold">
                  {formatTime(new Date(route.summary.move.to_time))}
                </div>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-3 border-t border-success/30 pt-3 text-sm">
              <span>🚶 {route.summary.move.walk_distance}m</span>
              <span>🔄 {route.summary.move.transit_count}回乗換</span>
              {#if route.summary.move.fare?.unit_48}
                <span>💳 ¥{route.summary.move.fare.unit_48}</span>
              {:else if route.summary.move.fare?.unit_0}
                <span>💴 ¥{route.summary.move.fare.unit_0}</span>
              {/if}
            </div>
          </div>
        </section>
      {:else if showLeaveNowRoute}
        <section class="mb-6">
          <div class="rounded-xl border border-warning bg-warning/10 p-4 text-sm text-warning">
            経路が見つかりませんでした
          </div>
        </section>
      {/if}

      <!-- Detailed Route Sections -->
      {#if selectedRoute}
        <section class="mb-6">
          <h3 class="mb-3 text-sm font-medium text-base-content/70">
            経路詳細
          </h3>
          <div class="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
            {#each selectedRoute.sections as section, index (index)}
              {#if isPointSection(section)}
                <!-- Station/Point -->
                <div class="flex items-center gap-3 px-4 py-3 {index > 0 ? 'border-t border-base-200' : ''}">
                  <div class="flex h-8 w-8 items-center justify-center rounded-full bg-base-200 text-sm">
                    {index === 0 ? "🚩" : index === selectedRoute.sections.length - 1 ? "🏁" : "📍"}
                  </div>
                  <div class="flex-1">
                    <div class="font-medium text-base-content">
                      {section.name === "start" ? "現在地" : section.name === "goal" ? "目的地" : section.name}
                    </div>
                    {#if section.gateway}
                      <div class="text-xs text-base-content/50">
                        {section.gateway}
                      </div>
                    {/if}
                  </div>
                  {#if section.from_time}
                    <div class="text-sm text-base-content/70">
                      {formatTime(new Date(section.from_time))}
                    </div>
                  {/if}
                </div>
              {:else if isMoveSection(section)}
                <!-- Movement Segment -->
                <div class="flex items-stretch border-t border-base-200">
                  <!-- Timeline line -->
                  <div class="flex w-12 flex-col items-center py-2">
                    <div
                      class="h-full w-1 rounded-full"
                      style="background-color: {section.transport?.color ?? '#64748b'}"
                    ></div>
                  </div>
                  <!-- Move details -->
                  <div class="flex-1 py-3 pr-4">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">{getMoveIcon(section.move)}</span>
                      <span class="font-medium" style="color: {section.transport?.color ?? 'inherit'}">
                        {getMoveLabel(section)}
                      </span>
                      {#if section.transport?.type && section.transport.type !== "普通"}
                        <span class="rounded bg-base-200 px-1.5 py-0.5 text-xs">
                          {section.transport.type}
                        </span>
                      {/if}
                    </div>
                    <div class="mt-1 flex flex-wrap gap-2 text-xs text-base-content/50">
                      {#if section.time}
                        <span>⏱️ {section.time}分</span>
                      {/if}
                      {#if section.distance}
                        <span>📏 {section.distance}m</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</div>
