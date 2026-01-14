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
    console.log(
      "[TransitView] navigator.geolocation available:",
      !!navigator?.geolocation,
    );
    await transitState.loadNextEventTransit();
    isInitialized = true;
    console.log(
      "[TransitView] Initialization complete, locationError:",
      transitState.locationError,
    );

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
    if (diffMinutes < 60) return `${diffMinutes}分後`;
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    if (hours < 24) return `${hours}時間${mins > 0 ? `${mins}分` : ""}後`;
    const days = Math.floor(hours / 24);
    return `${days}日後`;
  }

  function getImportanceLabel(importance: string): string {
    switch (importance) {
      case "high":
        return "重要";
      case "medium":
        return "普通";
      case "low":
        return "低";
      default:
        return "普通";
    }
  }

  function getImportanceClass(importance: string): string {
    switch (importance) {
      case "high":
        return "bg-error/10 text-error";
      case "medium":
        return "bg-warning/10 text-warning";
      case "low":
        return "bg-success/10 text-success";
      default:
        return "bg-base-200 text-base-content/70";
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
      return "徒歩";
    }
    return section.transport?.name ?? section.line_name ?? "移動";
  }

  function isPointSection(section: RouteSection): boolean {
    return section.type === "point";
  }

  function isMoveSection(section: RouteSection): boolean {
    return section.type === "move";
  }

  /**
   * Get platform badge component data
   * Returns symbol and number from platform numbering data
   */
  function getPlatformBadge(
    platform: { number: string; symbol: string } | undefined,
  ): { symbol: string; number: string } | null {
    if (!platform) return null;
    return {
      symbol: platform.symbol || "",
      number: platform.number || "",
    };
  }

  /**
   * Parse platform info from either object or string format
   * API may return platform as "2番線" string or {number, symbol} object
   */
  function parsePlatformInfo(
    platform: { number: string; symbol: string } | string | undefined,
  ): { symbol: string; number: string } | null {
    if (!platform) return null;
    if (typeof platform === "object") {
      return {
        symbol: platform.symbol || "",
        number: platform.number || "",
      };
    }
    // Parse string format like "2番線" or "A出口"
    return {
      symbol: platform.split(/\d/)[0] || "",
      number: platform.replace(/^\D+/, "") || "",
    };
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-base-100">
  <!-- Header -->
  <div
    class="flex items-center justify-between border-b border-base-200 px-5 py-4"
  >
    <h2 class="text-lg font-medium text-base-content">経路案内</h2>
    <div class="flex items-center gap-2">
      <button
        class="btn btn-square btn-ghost btn-sm"
        onclick={handleRefresh}
        disabled={isLoadingRoutes || isLoadingLocation}
        aria-label="更新"
      >
        <svg
          class="h-4 w-4 {isLoadingRoutes || isLoadingLocation
            ? 'animate-spin'
            : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
      {#if onClose}
        <button
          class="btn btn-square btn-ghost btn-sm"
          onclick={onClose}
          aria-label="閉じる"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    <!-- Location Status -->
    {#if locationError}
      <div class="m-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
        <div class="flex items-start gap-3">
          <svg
            class="mt-0.5 h-5 w-5 shrink-0 text-warning"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <div class="flex-1">
            <p class="text-sm font-medium text-warning">位置情報エラー</p>
            <p class="mt-1 text-xs text-base-content/60">{locationError}</p>
            <div class="mt-3 space-y-1 text-xs text-base-content/50">
              <p>• アドレスバーの🔒アイコンをクリック</p>
              <p>• 「位置情報」を「許可」に変更</p>
              <p>• ページを再読み込み</p>
            </div>
            <button class="btn mt-3 btn-ghost btn-xs" onclick={handleRefresh}>
              再試行
            </button>
          </div>
        </div>
      </div>
    {:else if userLocation}
      <div
        class="flex items-center gap-2 px-5 py-2 text-xs text-base-content/60"
      >
        <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
          <path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
          />
        </svg>
        <span>現在地取得済み</span>
        {#if userLocation.accuracy}
          <span class="text-base-content/50"
            >精度 {Math.round(userLocation.accuracy)}m</span
          >
        {/if}
      </div>
    {/if}

    <!-- Loading State -->
    {#if !isInitialized || isLoadingRoutes}
      <div class="flex flex-col items-center justify-center py-16">
        <span class="loading loading-md loading-spinner text-primary"></span>
        <p class="mt-4 text-sm text-base-content/50">
          {isLoadingLocation ? "現在地を取得中..." : "経路を検索中..."}
        </p>
      </div>
    {:else if routeError}
      <!-- Error State -->
      <div class="m-4 rounded-xl border border-error/30 bg-error/5 p-4">
        <div class="flex items-center gap-3">
          <svg
            class="h-5 w-5 shrink-0 text-error"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span class="text-sm text-error">{routeError}</span>
        </div>
      </div>
    {:else if !transitInfo}
      <!-- No Event State -->
      <div
        class="flex flex-col items-center justify-center px-6 py-16 text-center"
      >
        <div
          class="flex h-16 w-16 items-center justify-center rounded-2xl bg-base-200"
        >
          <svg
            class="h-8 w-8 text-base-content/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p class="mt-4 text-sm text-base-content/70">
          場所が設定された予定がありません
        </p>
        <p class="mt-1 text-xs text-base-content/40">
          カレンダーで予定に住所を追加してください
        </p>
      </div>
    {:else}
      <!-- Next Event Info -->
      <section class="border-b border-base-200 px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="truncate text-base font-medium text-base-content">
                {transitInfo.event.title}
              </h3>
              <span
                class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium {getImportanceClass(
                  transitInfo.importance,
                )}"
              >
                {getImportanceLabel(transitInfo.importance)}
              </span>
            </div>
            <p class="mt-1 truncate text-sm text-base-content/60">
              {transitInfo.eventLocation}
            </p>
          </div>
          <div class="shrink-0 text-right">
            <div class="text-sm font-medium text-base-content">
              {formatEventTime(transitInfo.eventStart)}
            </div>
            <div class="text-xs text-base-content/40">
              {getTimeUntilEvent(transitInfo.eventStart)}
            </div>
          </div>
        </div>
        <div
          class="mt-3 rounded-lg bg-base-200/60 px-3 py-2 text-xs text-base-content/60"
        >
          {transitInfo.bufferMinutes}分前到着を推奨
        </div>
      </section>

      <!-- Route Selection Tabs -->
      <section class="flex gap-2 border-b border-base-200 px-5 py-3">
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors
            {!showLeaveNowRoute && transitInfo.recommendedDeparture
            ? 'bg-primary/10 text-primary'
            : 'text-base-content/60 hover:bg-base-200'}"
          onclick={selectRecommendedRoute}
          disabled={!transitInfo.recommendedDeparture}
        >
          推奨出発
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors
            {showLeaveNowRoute
            ? 'bg-success/10 text-success'
            : 'text-base-content/60 hover:bg-base-200'}"
          onclick={handleLeaveNow}
          disabled={isLoadingRoutes}
        >
          今すぐ出発
        </button>
      </section>

      <!-- Recommended Departure Info -->
      {#if !showLeaveNowRoute && transitInfo.recommendedDeparture?.route}
        {@const dep = transitInfo.recommendedDeparture}
        <section class="border-b border-base-200 px-5 py-4">
          <div class="flex items-center gap-3">
            <div class="flex items-baseline gap-2">
              <div>
                <div
                  class="text-xs tracking-wide text-base-content/60 uppercase"
                >
                  出発
                </div>
                <div class="text-xl font-semibold text-primary tabular-nums">
                  {formatTime(dep.departureTime)}
                </div>
              </div>
              <svg
                class="h-4 w-4 text-base-content/50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
              <div>
                <div
                  class="text-xs tracking-wide text-base-content/60 uppercase"
                >
                  到着
                </div>
                <div class="text-xl font-semibold text-primary tabular-nums">
                  {formatTime(dep.arrivalTime)}
                </div>
              </div>
            </div>
            <div class="flex flex-1 flex-wrap items-center justify-end gap-1.5">
              <span
                class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
              >
                {dep.route.summary.move.time}分
              </span>
              <span
                class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
              >
                乗換{dep.route.summary.move.transit_count}回
              </span>
              {#if dep.route.summary.move.fare?.unit_48}
                <span
                  class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
                >
                  ¥{dep.route.summary.move.fare.unit_48}
                </span>
              {:else if dep.route.summary.move.fare?.unit_0}
                <span
                  class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
                >
                  ¥{dep.route.summary.move.fare.unit_0}
                </span>
              {/if}
            </div>
          </div>
        </section>
      {:else if !showLeaveNowRoute}
        <section class="border-b border-base-200 px-5 py-4">
          <div class="rounded-lg bg-warning/5 px-3 py-2 text-sm text-warning">
            推奨出発時刻は既に過ぎています
          </div>
        </section>
      {/if}

      <!-- Leave Now Info -->
      {#if showLeaveNowRoute && transitInfo.leaveNowRoute}
        {@const route = transitInfo.leaveNowRoute}
        <section class="border-b border-base-200 px-5 py-4">
          <div class="flex items-center gap-3">
            <div class="flex items-baseline gap-2">
              <div>
                <div
                  class="text-xs tracking-wide text-base-content/60 uppercase"
                >
                  出発
                </div>
                <div class="text-xl font-semibold text-success tabular-nums">
                  {formatTime(new Date(route.summary.move.from_time))}
                </div>
              </div>
              <svg
                class="h-4 w-4 text-base-content/50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
              <div>
                <div
                  class="text-xs tracking-wide text-base-content/60 uppercase"
                >
                  到着
                </div>
                <div class="text-xl font-semibold text-success tabular-nums">
                  {formatTime(new Date(route.summary.move.to_time))}
                </div>
              </div>
            </div>
            <div class="flex flex-1 flex-wrap items-center justify-end gap-1.5">
              <span
                class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
              >
                {route.summary.move.time}分
              </span>
              <span
                class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
              >
                乗換{route.summary.move.transit_count}回
              </span>
              {#if route.summary.move.fare?.unit_48}
                <span
                  class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
                >
                  ¥{route.summary.move.fare.unit_48}
                </span>
              {:else if route.summary.move.fare?.unit_0}
                <span
                  class="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70"
                >
                  ¥{route.summary.move.fare.unit_0}
                </span>
              {/if}
            </div>
          </div>
        </section>
      {:else if showLeaveNowRoute}
        <section class="border-b border-base-200 px-5 py-4">
          <div class="rounded-lg bg-warning/5 px-3 py-2 text-sm text-warning">
            経路が見つかりませんでした
          </div>
        </section>
      {/if}

      <!-- Detailed Route Sections -->
      {#if selectedRoute}
        <section class="px-5 py-4">
          <h3
            class="mb-3 text-xs font-medium tracking-wide text-base-content/40 uppercase"
          >
            経路詳細
          </h3>
          <div class="space-y-0">
            {#each selectedRoute.sections as section, index (index)}
              {#if isPointSection(section)}
                {@const prev =
                  index > 0 ? selectedRoute.sections[index - 1] : null}
                {@const next =
                  index < selectedRoute.sections.length - 1
                    ? selectedRoute.sections[index + 1]
                    : null}
                <!-- Station/Point -->
                <div class="flex items-stretch">
                  <!-- Timeline -->
                  <div class="flex w-10 flex-col items-center">
                    <div
                      class="h-2 w-0.5 bg-base-300"
                      class:invisible={index === 0}
                    ></div>
                    <div
                      class="flex h-3 w-3 items-center justify-center rounded-full border-2 border-base-content/30 bg-base-100"
                    ></div>
                    <div
                      class="w-0.5 flex-1 bg-base-300"
                      class:invisible={index ===
                        selectedRoute.sections.length - 1}
                    ></div>
                  </div>
                  <!-- Content -->
                  <div class="flex min-w-0 flex-1 items-center gap-3 py-2">
                    <!-- Time -->
                    <div class="w-14 shrink-0">
                      {#if prev && prev.type === "move" && prev.to_time}
                        <div class="flex items-baseline gap-0.5">
                          <span
                            class="text-sm font-medium text-base-content tabular-nums"
                          >
                            {formatTime(new Date(prev.to_time))}
                          </span>
                          <span class="text-[10px] text-base-content/60"
                            >着</span
                          >
                        </div>
                      {/if}
                      {#if next && next.type === "move" && next.from_time}
                        <div class="flex items-baseline gap-0.5">
                          <span
                            class="text-sm font-medium text-base-content tabular-nums"
                          >
                            {formatTime(new Date(next.from_time))}
                          </span>
                          <span class="text-[10px] text-base-content/60"
                            >発</span
                          >
                        </div>
                      {/if}
                    </div>
                    <!-- Station name -->
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        class="truncate text-sm font-medium text-base-content"
                      >
                        {section.name === "start"
                          ? "現在地"
                          : section.name === "goal"
                            ? "目的地"
                            : section.name}
                      </span>
                      {#if section.gateway}
                        <span
                          class="shrink-0 rounded bg-base-200 px-1.5 py-0.5 text-[10px] text-base-content/60"
                        >
                          {section.gateway}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
              {:else if isMoveSection(section)}
                {@const prevPoint =
                  index > 0 ? selectedRoute.sections[index - 1] : null}
                {@const nextPoint =
                  index < selectedRoute.sections.length - 1
                    ? selectedRoute.sections[index + 1]
                    : null}
                {@const boardingPlatform = prevPoint?.numbering?.departure?.[0]}
                {@const alightingPlatform = nextPoint?.numbering?.arrival?.[0]}
                {@const startPlatform = section.start_platform}
                {@const goalPlatform = section.goal_platform}
                <!-- Movement Segment -->
                <div class="flex items-stretch">
                  <!-- Timeline -->
                  <div class="flex w-10 flex-col items-center">
                    <div
                      class="w-1 flex-1 rounded-full"
                      style="background-color: {section.transport?.color ??
                        '#cbd5e1'}"
                    ></div>
                  </div>
                  <!-- Content -->
                  <div class="flex-1 py-2 pl-1">
                    {#if boardingPlatform || startPlatform}
                      {@const badge = boardingPlatform
                        ? getPlatformBadge(boardingPlatform)
                        : parsePlatformInfo(startPlatform)}
                      {#if badge && (badge.symbol || badge.number)}
                        <div class="mb-1.5 flex items-center">
                          <div
                            class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white"
                            style="border: 2px solid {section.transport
                              ?.color ?? '#cbd5e1'};"
                          >
                            <div
                              class="flex flex-col items-center justify-center"
                            >
                              {#if badge.symbol}
                                <span
                                  class="text-xs leading-none font-bold text-base-content"
                                  >{badge.symbol}</span
                                >
                              {/if}
                              {#if badge.number}
                                <span
                                  class="text-[10px] leading-tight font-medium text-base-content/70"
                                  >{badge.number}</span
                                >
                              {/if}
                            </div>
                          </div>
                        </div>
                      {/if}
                    {/if}
                    <div class="flex items-center gap-2">
                      <span class="text-base">{getMoveIcon(section.move)}</span>
                      <span
                        class="text-sm font-medium"
                        style="color: {section.transport?.color ?? 'inherit'}"
                      >
                        {getMoveLabel(section)}
                      </span>
                      {#if section.transport?.links && section.transport.links.length > 0}
                        {@const destination =
                          section.transport.links[0].destination}
                        <span class="text-xs text-base-content/50">
                          {destination.name}行き
                        </span>
                      {/if}
                      {#if section.transport?.type && section.transport.type !== "普通"}
                        <span
                          class="rounded bg-base-200 px-1.5 py-0.5 text-[10px] text-base-content/60"
                        >
                          {section.transport.type}
                        </span>
                      {/if}
                    </div>
                    <div
                      class="mt-1 flex items-center gap-3 text-xs text-base-content/40"
                    >
                      {#if section.time}
                        <span>{section.time}分</span>
                      {/if}
                      {#if section.transport?.fare?.unit_48}
                        <span>¥{section.transport.fare.unit_48}</span>
                      {:else if section.transport?.fare?.unit_0}
                        <span>¥{section.transport.fare.unit_0}</span>
                      {/if}
                    </div>
                    {#if alightingPlatform || goalPlatform}
                      {@const badge = alightingPlatform
                        ? getPlatformBadge(alightingPlatform)
                        : parsePlatformInfo(goalPlatform)}
                      {#if badge && (badge.symbol || badge.number)}
                        <div class="mt-1.5 flex items-center">
                          <div
                            class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white"
                            style="border: 2px solid {section.transport
                              ?.color ?? '#cbd5e1'};"
                          >
                            <div
                              class="flex flex-col items-center justify-center"
                            >
                              {#if badge.symbol}
                                <span
                                  class="text-xs leading-none font-bold text-base-content"
                                  >{badge.symbol}</span
                                >
                              {/if}
                              {#if badge.number}
                                <span
                                  class="text-[10px] leading-tight font-medium text-base-content/70"
                                  >{badge.number}</span
                                >
                              {/if}
                            </div>
                          </div>
                        </div>
                      {/if}
                    {/if}
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
