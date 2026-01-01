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
  import { invalidateTimetableCache } from "../services/timetable-events";
  import { unifiedGapState } from "$lib/features/assistant/state/unified-gaps.svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  // Loading state
  let isLoading = $state(true);

  // Config state
  let config = $state<TimetableConfigData>({
    dayStartTime: "09:00",
    lunchStartTime: "12:00",
    lunchEndTime: "13:00",
    breakDuration: 10,
    cellDuration: 50,
    exceptionRanges: [],
  });

  // Exception ranges state (local for editing)
  let exceptionRanges = $state<TimetableExceptionRange[]>([]);

  // Cells state - Map<dayOfWeek, Map<slotIndex, cell>>
  interface CellData {
    id?: string;
    dayOfWeek: number;
    slotIndex: number;
    title: string;
    attendance: "出席する" | "出席しない";
    workAllowed: "作業可" | "作業不可";
  }
  let cells = new SvelteMap<number, SvelteMap<number, CellData>>();

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

      // Build cells map using SvelteMap for reactivity
      const newCells = new SvelteMap<number, SvelteMap<number, CellData>>();
      for (const cell of cellsResult) {
        if (!newCells.has(cell.dayOfWeek)) {
          newCells.set(cell.dayOfWeek, new SvelteMap());
        }
        newCells.get(cell.dayOfWeek)?.set(cell.slotIndex, {
          id: cell.id,
          dayOfWeek: cell.dayOfWeek,
          slotIndex: cell.slotIndex,
          title: cell.title,
          attendance: cell.attendance as "出席する" | "出席しない",
          workAllowed: cell.workAllowed as "作業可" | "作業不可",
        });
      }
      cells = newCells;
    } catch (error) {
      console.error("Failed to load timetable data:", error);
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

  function updateExceptionRange(index: number, field: "start" | "end", value: string) {
    exceptionRanges = exceptionRanges.map((range, i) =>
      i === index ? { ...range, [field]: value } : range
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
    class="modal-open modal modal-mobile-fullscreen z-[2100] md:modal-middle"
    role="dialog"
    aria-modal="true"
    aria-labelledby="timetable-title"
  >
    <div class="modal-box h-full w-full max-w-4xl p-0 overflow-hidden md:h-auto md:w-11/12 md:overflow-visible">
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-base-300 p-4 flex-shrink-0"
      >
        <h3 id="timetable-title" class="text-lg font-medium">時間割設定</h3>
        <button
          class="btn btn-square btn-ghost btn-sm"
          onclick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {#if isLoading}
        <div class="flex items-center justify-center p-12 flex-1">
          <span class="loading loading-lg loading-spinner"></span>
        </div>
      {:else}
        <div class="flex-1 overflow-y-auto min-h-0 flex flex-col">
        <!-- Settings Row -->
        <div
          class="grid grid-cols-5 gap-3 border-b border-base-300 p-4 flex-shrink-0"
        >
          <label class="form-control w-full">
            <div class="label py-1">
              <span class="label-text text-xs">開始時間</span>
            </div>
            <input
              type="time"
              class="input-bordered input input-sm w-full"
              bind:value={config.dayStartTime}
              onchange={handleConfigChange}
            />
          </label>
          <label class="form-control w-full">
            <div class="label py-1">
              <span class="label-text text-xs">昼休み開始</span>
            </div>
            <input
              type="time"
              class="input-bordered input input-sm w-full"
              bind:value={config.lunchStartTime}
              onchange={handleConfigChange}
            />
          </label>
          <label class="form-control w-full">
            <div class="label py-1">
              <span class="label-text text-xs">昼休み終了</span>
            </div>
            <input
              type="time"
              class="input-bordered input input-sm w-full"
              bind:value={config.lunchEndTime}
              onchange={handleConfigChange}
            />
          </label>
          <label class="form-control w-full">
            <div class="label py-1">
              <span class="label-text text-xs">授業時間(分)</span>
            </div>
            <input
              type="number"
              class="input-bordered input input-sm w-full"
              bind:value={config.cellDuration}
              onchange={handleConfigChange}
              min="10"
              max="180"
            />
          </label>
          <label class="form-control w-full">
            <div class="label py-1">
              <span class="label-text text-xs">休憩時間(分)</span>
            </div>
            <input
              type="number"
              class="input-bordered input input-sm w-full"
              bind:value={config.breakDuration}
              onchange={handleConfigChange}
              min="0"
              max="60"
            />
          </label>
        </div>

        <!-- Timetable Grid -->
        <div class="overflow-x-auto p-4">
          <table class="table w-full table-fixed">
            <thead>
              <tr>
                <th class="w-16 text-center text-xs">時限</th>
                {#each weekdays as day (day)}
                  <th class="text-center text-sm font-medium">{day}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each Array(SLOTS_PER_DAY) as _, slotIndex (slotIndex)}
                <tr>
                  <td class="text-center text-xs text-base-content/60">
                    {getSlotStartTime(slotIndex)}
                  </td>
                  {#each Array(5) as _, dayIndex (dayIndex)}
                    {@const cell = getCell(dayIndex, slotIndex)}
                    <td
                      class="cursor-pointer p-1 transition-colors hover:bg-base-300/50"
                    >
                      <button
                        class="flex h-16 w-full flex-col items-center justify-center rounded-lg p-1 text-xs transition-colors {getCellBgClass(
                          cell,
                        )}"
                        onclick={() => openCellEditor(dayIndex, slotIndex)}
                      >
                        {#if cell && cell.attendance === "出席する"}
                          <span class="font-medium">{cell.title || "無題"}</span
                          >
                          <span class="mt-0.5 opacity-70"
                            >{cell.workAllowed}</span
                          >
                        {:else if cell?.attendance === "出席しない"}
                          <span class="opacity-50">欠席</span>
                        {:else}
                          <span class="opacity-30">+</span>
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
        <div class="border-t border-base-300 p-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-medium">休講期間（時間割を適用しない期間）</h4>
            <button
              type="button"
              class="btn btn-xs btn-ghost"
              onclick={addExceptionRange}
            >
              + 追加
            </button>
          </div>
          
          {#if exceptionRanges.length === 0}
            <p class="text-xs text-base-content/50 text-center py-2">
              休講期間は設定されていません
            </p>
          {:else}
            <div class="flex flex-col gap-2">
              {#each exceptionRanges as range, index (index)}
                <div class="flex items-center gap-2">
                  <input
                    type="date"
                    class="input input-bordered input-sm flex-1"
                    value={range.start}
                    onchange={(e) => updateExceptionRange(index, "start", e.currentTarget.value)}
                  />
                  <span class="text-xs text-base-content/60">〜</span>
                  <input
                    type="date"
                    class="input input-bordered input-sm flex-1"
                    value={range.end}
                    onchange={(e) => updateExceptionRange(index, "end", e.currentTarget.value)}
                  />
                  <button
                    type="button"
                    class="btn btn-xs btn-ghost btn-square text-error"
                    onclick={() => removeExceptionRange(index)}
                    aria-label="削除"
                  >
                    ✕
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Legend -->
        <div
          class="flex flex-wrap items-center justify-center gap-4 border-t border-base-300 px-4 py-3 text-xs flex-shrink-0"
        >
          <div class="flex items-center gap-1.5">
            <div class="h-3 w-3 rounded bg-warning/30"></div>
            <span>作業不可（タイムラインに表示）</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="h-3 w-3 rounded bg-success/30"></div>
            <span>作業可</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="h-3 w-3 rounded bg-base-200"></div>
            <span>欠席</span>
          </div>
        </div>
        </div>
      {/if}
    </div>

    <!-- Cell Editor Sub-Modal -->
    {#if showCellEditor && editingCell}
      <div
        class="modal-open modal modal-mobile-fullscreen z-[2200] md:modal-middle"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-editor-title"
      >
        <div class="modal-box h-full w-full max-w-sm p-0 overflow-hidden md:h-auto md:overflow-visible flex flex-col">
          <h3 id="cell-editor-title" class="mb-4 text-lg font-medium p-4 pb-0 flex-shrink-0">
            セルを編集
          </h3>

          <div class="space-y-4 p-4 overflow-y-auto flex-1 min-h-0">
            <label class="form-control w-full">
              <div class="label">
                <span class="label-text">タイトル</span>
              </div>
              <input
                type="text"
                class="input-bordered input w-full"
                bind:value={editorTitle}
                placeholder="科目名"
              />
            </label>

            <label class="form-control w-full">
              <div class="label">
                <span class="label-text">出席</span>
              </div>
              <select
                class="select-bordered select w-full"
                bind:value={editorAttendance}
              >
                <option value="出席する">出席する</option>
                <option value="出席しない">出席しない</option>
              </select>
            </label>

            <label class="form-control w-full">
              <div class="label">
                <span class="label-text">作業許可</span>
              </div>
              <select
                class="select-bordered select w-full"
                bind:value={editorWorkAllowed}
              >
                <option value="作業不可">作業不可（時間ブロック）</option>
                <option value="作業可">作業可</option>
              </select>
            </label>
          </div>

          <div class="modal-action flex-shrink-0 p-4 pt-0">
            {#if editingCell.id}
              <button
                class="btn btn-outline btn-error"
                onclick={handleDeleteCell}
                disabled={isSaving}
              >
                削除
              </button>
            {/if}
            <button
              class="btn btn-ghost"
              onclick={() => {
                showCellEditor = false;
                editingCell = null;
              }}
            >
              キャンセル
            </button>
            <button
              class="btn btn-primary"
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
        <div
          class="modal-backdrop bg-black/40 backdrop-blur-sm"
          onclick={() => {
            showCellEditor = false;
            editingCell = null;
          }}
          onkeydown={(e) => e.key === "Escape" && (showCellEditor = false)}
          role="button"
          tabindex="-1"
          aria-label="Close cell editor"
        ></div>
      </div>
    {/if}

    <div
      class="modal-backdrop bg-black/40 backdrop-blur-sm"
      onclick={onClose}
      onkeydown={(e) => e.key === "Escape" && onClose()}
      role="button"
      tabindex="-1"
      aria-label="Close timetable popup"
    ></div>
  </div>
{/if}
