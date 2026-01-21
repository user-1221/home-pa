<script lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import {
    fetchTimetableConfig,
    upsertTimetableConfig,
    fetchTimetableCells,
    upsertTimetableCell,
    deleteTimetableCell,
  } from "../state/timetable.functions.remote";
  import {
    computeSlotTimes,
    formatMinutesToTime,
    type TimetableConfigData,
    type TimetableExceptionRange,
  } from "../utils/timetable-utils";
  import {
    invalidateTimetableCache,
    isTimetableCached,
    getCachedTimetableData,
    type TimetableCellData,
  } from "../services/timetable-events";
  import { unifiedGapState } from "$lib/features/assistant/state/unified-gaps.svelte";
  import { toastState } from "$lib/bootstrap/toast.svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  // Cells state - Map<dayOfWeek, Map<slotIndex, cell>>
  interface CellData {
    id?: string;
    dayOfWeek: number;
    slotIndex: number;
    title: string;
    attendance: "出席する" | "出席しない";
    workAllowed: "作業可" | "作業不可";
  }

  // Helper to build cells map from raw cell data
  function buildCellsMap(
    cellsData: TimetableCellData[] | undefined,
  ): SvelteMap<number, SvelteMap<number, CellData>> {
    const map = new SvelteMap<number, SvelteMap<number, CellData>>();
    if (!cellsData) return map;
    for (const cell of cellsData) {
      if (!map.has(cell.dayOfWeek)) {
        map.set(cell.dayOfWeek, new SvelteMap());
      }
      map.get(cell.dayOfWeek)?.set(cell.slotIndex, {
        id: cell.id,
        dayOfWeek: cell.dayOfWeek,
        slotIndex: cell.slotIndex,
        title: cell.title,
        attendance: cell.attendance as "出席する" | "出席しない",
        workAllowed: cell.workAllowed as "作業可" | "作業不可",
      });
    }
    return map;
  }

  // Initialize from cache if available
  const cached = getCachedTimetableData();

  // Loading state - only true if no cache available
  let isLoading = $state(!isTimetableCached());

  // Config state - initialize from cache if available
  let config = $state<TimetableConfigData>(
    cached?.config ?? {
      dayStartTime: "09:00",
      lunchStartTime: "12:00",
      lunchEndTime: "13:00",
      breakDuration: 10,
      cellDuration: 50,
      exceptionRanges: [],
    },
  );

  // Exception ranges state (local for editing) - initialize from cache
  let exceptionRanges = $state<TimetableExceptionRange[]>(
    cached?.config.exceptionRanges ?? [],
  );

  // Cells state - initialize from cache
  let cells = buildCellsMap(cached?.cells);

  // Cell editor state
  let showCellEditor = $state(false);
  let editingCell = $state<CellData | null>(null);
  let editorTitle = $state("");
  let editorAttendance = $state<"出席する" | "出席しない">("出席する");
  let editorWorkAllowed = $state<"作業可" | "作業不可">("作業不可");
  let isSaving = $state(false);

  const weekdays = ["月", "火", "水", "木", "金"];
  const SLOTS_PER_DAY = 5;

  // Load data when popup opens
  $effect(() => {
    if (isOpen && isLoading) {
      loadData();
    }
  });

  async function loadData() {
    isLoading = true;
    try {
      const [configResult, cellsResult] = await Promise.all([
        fetchTimetableConfig({}),
        fetchTimetableCells({}),
      ]);

      if (configResult) {
        config = {
          dayStartTime: configResult.dayStartTime,
          lunchStartTime: configResult.lunchStartTime,
          lunchEndTime: configResult.lunchEndTime,
          breakDuration: configResult.breakDuration,
          cellDuration: configResult.cellDuration,
          exceptionRanges: configResult.exceptionRanges ?? [],
        };
        exceptionRanges = configResult.exceptionRanges ?? [];
      }

      cells = buildCellsMap(cellsResult);
    } catch (error) {
      console.error("Failed to load timetable data:", error);
      toastState.error("時間割データの読み込みに失敗しました");
    } finally {
      isLoading = false;
    }
  }

  async function handleConfigChange() {
    try {
      await upsertTimetableConfig({
        ...config,
        exceptionRanges: exceptionRanges,
      });
      // Invalidate cache so timeline picks up the new config
      invalidateTimetableCache();
      // Reload timetable events for the selected date (force reload to bypass date cache)
      await unifiedGapState.loadTimetableEvents(true);
    } catch (error) {
      console.error("Failed to save config:", error);
      toastState.error("設定の保存に失敗しました");
    }
  }

  function addExceptionRange() {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    exceptionRanges = [
      ...exceptionRanges,
      { start: formatDate(today), end: formatDate(nextWeek) },
    ];
    handleConfigChange();
  }

  function removeExceptionRange(index: number) {
    exceptionRanges = exceptionRanges.filter((_, i) => i !== index);
    handleConfigChange();
  }

  function updateExceptionRange(
    index: number,
    field: "start" | "end",
    value: string,
  ) {
    exceptionRanges = exceptionRanges.map((range, i) =>
      i === index ? { ...range, [field]: value } : range,
    );
    handleConfigChange();
  }

  function getSlotStartTime(slotIndex: number): string {
    const { startMinutes } = computeSlotTimes(config, slotIndex);
    return formatMinutesToTime(startMinutes);
  }

  function getCell(dayOfWeek: number, slotIndex: number): CellData | undefined {
    return cells.get(dayOfWeek)?.get(slotIndex);
  }

  function openCellEditor(dayOfWeek: number, slotIndex: number) {
    const existing = getCell(dayOfWeek, slotIndex);
    if (existing) {
      editingCell = { ...existing };
      editorTitle = existing.title;
      editorAttendance = existing.attendance;
      editorWorkAllowed = existing.workAllowed;
    } else {
      editingCell = {
        dayOfWeek,
        slotIndex,
        title: "",
        attendance: "出席する",
        workAllowed: "作業不可",
      };
      editorTitle = "";
      editorAttendance = "出席する";
      editorWorkAllowed = "作業不可";
    }
    showCellEditor = true;
  }

  async function handleSaveCell() {
    if (!editingCell) return;
    isSaving = true;

    try {
      const result = await upsertTimetableCell({
        dayOfWeek: editingCell.dayOfWeek,
        slotIndex: editingCell.slotIndex,
        title: editorTitle,
        attendance: editorAttendance,
        workAllowed: editorWorkAllowed,
      });

      // Update local state
      if (!cells.has(editingCell.dayOfWeek)) {
        cells.set(editingCell.dayOfWeek, new SvelteMap());
      }
      cells.get(editingCell.dayOfWeek)?.set(editingCell.slotIndex, {
        id: result.id,
        dayOfWeek: result.dayOfWeek,
        slotIndex: result.slotIndex,
        title: result.title,
        attendance: result.attendance as "出席する" | "出席しない",
        workAllowed: result.workAllowed as "作業可" | "作業不可",
      });
      // Invalidate cache so timeline picks up the new cell
      invalidateTimetableCache();
      await unifiedGapState.loadTimetableEvents(true);
      showCellEditor = false;
      editingCell = null;
    } catch (error) {
      console.error("Failed to save cell:", error);
      toastState.error("セルの保存に失敗しました");
    } finally {
      isSaving = false;
    }
  }

  async function handleDeleteCell() {
    if (!editingCell?.id) return;
    if (!confirm("このセルを削除しますか？")) return;

    isSaving = true;
    try {
      await deleteTimetableCell({ id: editingCell.id });

      // Remove from local state
      cells.get(editingCell.dayOfWeek)?.delete(editingCell.slotIndex);
      // Invalidate cache so timeline picks up the deletion
      invalidateTimetableCache();
      await unifiedGapState.loadTimetableEvents(true);

      showCellEditor = false;
      editingCell = null;
    } catch (error) {
      console.error("Failed to delete cell:", error);
      toastState.error("セルの削除に失敗しました");
    } finally {
      isSaving = false;
    }
  }

  function getCellBgClass(cell: CellData | undefined): string {
    if (!cell || cell.attendance === "出席しない") {
      return "bg-base-200 text-base-content/50";
    }
    if (cell.workAllowed === "作業可") {
      return "bg-success/20 text-success-content";
    }
    // 作業不可 - this will block time on timeline
    return "bg-warning/20 text-warning-content";
  }
</script>

{#if !isOpen}
  <!-- Hidden when not open -->
{:else}
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2100] md:modal-middle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="timetable-title"
  >
    <div
      class="modal-box h-full w-full max-w-4xl overflow-hidden p-0 md:h-auto md:w-11/12 md:overflow-visible"
    >
      <!-- Header -->
      <div
        class="flex flex-shrink-0 items-center justify-between border-b border-base-300 bg-base-100 px-5 py-4"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-100)]"
          >
            <span class="text-base">📅</span>
          </div>
          <h3 id="timetable-title" class="text-base font-medium tracking-tight">
            時間割設定
          </h3>
        </div>
        <button
          class="btn btn-circle text-base-content/60 btn-ghost btn-sm hover:text-base-content"
          onclick={onClose}
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {#if isLoading}
        <div class="flex flex-1 items-center justify-center p-12">
          <span class="loading loading-lg loading-spinner"></span>
        </div>
      {:else}
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <!-- Settings Row -->
          <div
            class="flex-shrink-0 border-b border-base-300 bg-[var(--color-surface-50)] px-5 py-4"
          >
            <div class="mb-3 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-[var(--color-text-secondary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span
                class="text-xs font-medium text-[var(--color-text-secondary)]"
                >基本設定</span
              >
            </div>
            <div class="grid grid-cols-5 gap-3">
              <label class="form-control w-full">
                <div class="label py-1">
                  <span
                    class="label-text text-xs text-[var(--color-text-muted)]"
                    >開始時間</span
                  >
                </div>
                <input
                  type="time"
                  class="input input-sm w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                  bind:value={config.dayStartTime}
                  onchange={handleConfigChange}
                />
              </label>
              <label class="form-control w-full">
                <div class="label py-1">
                  <span
                    class="label-text text-xs text-[var(--color-text-muted)]"
                    >昼休み開始</span
                  >
                </div>
                <input
                  type="time"
                  class="input input-sm w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                  bind:value={config.lunchStartTime}
                  onchange={handleConfigChange}
                />
              </label>
              <label class="form-control w-full">
                <div class="label py-1">
                  <span
                    class="label-text text-xs text-[var(--color-text-muted)]"
                    >昼休み終了</span
                  >
                </div>
                <input
                  type="time"
                  class="input input-sm w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                  bind:value={config.lunchEndTime}
                  onchange={handleConfigChange}
                />
              </label>
              <label class="form-control w-full">
                <div class="label py-1">
                  <span
                    class="label-text text-xs text-[var(--color-text-muted)]"
                    >授業時間(分)</span
                  >
                </div>
                <input
                  type="number"
                  class="input input-sm w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                  bind:value={config.cellDuration}
                  onchange={handleConfigChange}
                  min="10"
                  max="180"
                />
              </label>
              <label class="form-control w-full">
                <div class="label py-1">
                  <span
                    class="label-text text-xs text-[var(--color-text-muted)]"
                    >休憩時間(分)</span
                  >
                </div>
                <input
                  type="number"
                  class="input input-sm w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                  bind:value={config.breakDuration}
                  onchange={handleConfigChange}
                  min="0"
                  max="60"
                />
              </label>
            </div>
          </div>

          <!-- Timetable Grid -->
          <div class="overflow-x-auto px-5 py-4">
            <table class="table w-full table-fixed">
              <thead>
                <tr class="border-b border-base-300">
                  <th
                    class="w-16 bg-transparent py-3 text-center text-xs font-normal text-[var(--color-text-muted)]"
                    >時限</th
                  >
                  {#each weekdays as day (day)}
                    <th
                      class="bg-transparent py-3 text-center text-sm font-medium text-[var(--color-text-primary)]"
                      >{day}</th
                    >
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each Array(SLOTS_PER_DAY) as _, slotIndex (slotIndex)}
                  <tr class="border-b border-base-200/60">
                    <td
                      class="py-2 text-center text-xs text-[var(--color-text-muted)] tabular-nums"
                    >
                      {getSlotStartTime(slotIndex)}
                    </td>
                    {#each Array(5) as _, dayIndex (dayIndex)}
                      {@const cell = getCell(dayIndex, slotIndex)}
                      <td class="p-1.5">
                        <button
                          class="flex h-14 w-full flex-col items-center justify-center rounded-lg border border-transparent p-1.5 text-xs transition-all duration-150 hover:border-base-300 hover:shadow-sm {getCellBgClass(
                            cell,
                          )}"
                          onclick={() => openCellEditor(dayIndex, slotIndex)}
                        >
                          {#if cell && cell.attendance === "出席する"}
                            <span class="leading-tight font-medium"
                              >{cell.title || "無題"}</span
                            >
                            <span
                              class="mt-0.5 text-[10px] leading-tight opacity-60"
                              >{cell.workAllowed}</span
                            >
                          {:else if cell?.attendance === "出席しない"}
                            <span class="text-[10px] opacity-50">欠席</span>
                          {:else}
                            <span class="text-base opacity-20">+</span>
                          {/if}
                        </button>
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Exception Ranges -->
          <div class="border-t border-base-300 bg-base-100 px-5 py-4">
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 text-[var(--color-text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <h4
                  class="text-xs font-medium text-[var(--color-text-secondary)]"
                >
                  休講期間
                </h4>
              </div>
              <button
                type="button"
                class="btn gap-1 text-[var(--color-primary)] btn-ghost btn-xs hover:bg-[var(--color-primary-100)]"
                onclick={addExceptionRange}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                追加
              </button>
            </div>

            {#if exceptionRanges.length === 0}
              <div
                class="flex items-center justify-center rounded-lg border border-dashed border-base-300 py-4"
              >
                <p class="text-xs text-[var(--color-text-muted)]">
                  休講期間は設定されていません
                </p>
              </div>
            {:else}
              <div class="flex flex-col gap-2">
                {#each exceptionRanges as range, index (index)}
                  <div
                    class="flex items-center gap-2 rounded-lg bg-[var(--color-surface-50)] p-2"
                  >
                    <input
                      type="date"
                      class="input input-sm flex-1 border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                      value={range.start}
                      onchange={(
                        e: Event & { currentTarget: HTMLInputElement },
                      ) =>
                        updateExceptionRange(
                          index,
                          "start",
                          e.currentTarget.value,
                        )}
                    />
                    <span class="text-xs text-[var(--color-text-muted)]"
                      >〜</span
                    >
                    <input
                      type="date"
                      class="input input-sm flex-1 border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                      value={range.end}
                      onchange={(
                        e: Event & { currentTarget: HTMLInputElement },
                      ) =>
                        updateExceptionRange(
                          index,
                          "end",
                          e.currentTarget.value,
                        )}
                    />
                    <button
                      type="button"
                      class="btn btn-circle text-[var(--color-text-muted)] btn-ghost btn-xs hover:bg-[var(--color-error-100)] hover:text-[var(--color-error-500)]"
                      onclick={() => removeExceptionRange(index)}
                      aria-label="削除"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Legend -->
          <div
            class="flex flex-shrink-0 flex-wrap items-center justify-center gap-5 border-t border-base-300 bg-[var(--color-bg-grid)] px-5 py-3"
          >
            <div class="flex items-center gap-2">
              <div
                class="h-3 w-3 rounded-sm border border-warning/40 bg-warning/25"
              ></div>
              <span class="text-xs text-[var(--color-text-secondary)]"
                >作業不可</span
              >
            </div>
            <div class="flex items-center gap-2">
              <div
                class="h-3 w-3 rounded-sm border border-success/40 bg-success/25"
              ></div>
              <span class="text-xs text-[var(--color-text-secondary)]"
                >作業可</span
              >
            </div>
            <div class="flex items-center gap-2">
              <div
                class="h-3 w-3 rounded-sm border border-base-300 bg-base-200"
              ></div>
              <span class="text-xs text-[var(--color-text-secondary)]"
                >欠席</span
              >
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Cell Editor Sub-Modal -->
    {#if showCellEditor && editingCell}
      <div
        class="modal-open modal-mobile-fullscreen modal z-[2200] md:modal-middle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-editor-title"
      >
        <div
          class="modal-box flex h-full w-full max-w-sm flex-col overflow-hidden p-0 md:h-auto md:overflow-visible"
        >
          <!-- Sub-modal header -->
          <div
            class="flex flex-shrink-0 items-center justify-between border-b border-base-300 px-5 py-4"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-100)]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 text-[var(--color-text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <h3 id="cell-editor-title" class="text-base font-medium">
                セルを編集
              </h3>
            </div>
            <button
              class="btn btn-circle text-base-content/60 btn-ghost btn-sm hover:text-base-content"
              onclick={() => {
                showCellEditor = false;
                editingCell = null;
              }}
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <label class="form-control w-full">
              <div class="label py-1">
                <span class="label-text text-xs text-[var(--color-text-muted)]"
                  >タイトル</span
                >
              </div>
              <input
                type="text"
                class="input w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                bind:value={editorTitle}
                placeholder="科目名"
              />
            </label>

            <label class="form-control w-full">
              <div class="label py-1">
                <span class="label-text text-xs text-[var(--color-text-muted)]"
                  >出席</span
                >
              </div>
              <select
                class="select w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                bind:value={editorAttendance}
              >
                <option value="出席する">出席する</option>
                <option value="出席しない">出席しない</option>
              </select>
            </label>

            <label class="form-control w-full">
              <div class="label py-1">
                <span class="label-text text-xs text-[var(--color-text-muted)]"
                  >作業許可</span
                >
              </div>
              <select
                class="select w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                bind:value={editorWorkAllowed}
              >
                <option value="作業不可">作業不可（時間ブロック）</option>
                <option value="作業可">作業可</option>
              </select>
            </label>
          </div>

          <div
            class="flex flex-shrink-0 items-center justify-between border-t border-base-300 bg-[var(--color-bg-grid)] p-4"
          >
            <div>
              {#if editingCell.id}
                <button
                  class="btn text-[var(--color-error-500)] btn-ghost btn-sm hover:bg-[var(--color-error-100)]"
                  onclick={handleDeleteCell}
                  disabled={isSaving}
                >
                  削除
                </button>
              {/if}
            </div>
            <div class="flex gap-2">
              <button
                class="btn btn-ghost btn-sm"
                onclick={() => {
                  showCellEditor = false;
                  editingCell = null;
                }}
              >
                キャンセル
              </button>
              <button
                class="btn btn-sm btn-primary"
                onclick={handleSaveCell}
                disabled={isSaving}
              >
                {#if isSaving}
                  <span class="loading loading-sm loading-spinner"></span>
                {:else}
                  保存
                {/if}
              </button>
            </div>
          </div>
        </div>
        <div
          class="modal-backdrop bg-black/40 backdrop-blur-sm"
          onclick={() => {
            showCellEditor = false;
            editingCell = null;
          }}
          onkeydown={(e: KeyboardEvent) =>
            e.key === "Escape" && (showCellEditor = false)}
          role="button"
          tabindex="-1"
          aria-label="Close cell editor"
        ></div>
      </div>
    {/if}

    <div
      class="modal-backdrop bg-black/40 backdrop-blur-sm"
      onclick={onClose}
      onkeydown={(e: KeyboardEvent) => e.key === "Escape" && onClose()}
      role="button"
      tabindex="-1"
      aria-label="Close timetable popup"
    ></div>
  </div>
{/if}
