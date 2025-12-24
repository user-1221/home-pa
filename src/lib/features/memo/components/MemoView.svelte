<script lang="ts">
  import { memoState, type MemoType } from "$lib/bootstrap/index.svelte.ts";

  // Local UI state
  let memoText = $state("");
  let showAddForm = $state(false);
  let editingMemoId = $state<string | null>(null);

  function startNewMemo() {
    memoText = "";
    editingMemoId = null;
    memoState.resetForm();
    showAddForm = true;
  }

  function cancelMemo() {
    memoText = "";
    editingMemoId = null;
    memoState.resetForm();
    showAddForm = false;
  }

  function saveMemo() {
    if (!memoText.trim()) return;
    memoState.create(memoText.trim());
    memoText = "";
    showAddForm = false;
  }

  function startEditMemo(memo: MemoType) {
    editingMemoId = memo.id;
    memoText = memo.text;
  }

  function saveEditMemo() {
    if (editingMemoId && memoText.trim()) {
      memoState.update(editingMemoId, memoText.trim());
      cancelEditMemo();
    }
  }

  function cancelEditMemo() {
    editingMemoId = null;
    memoText = "";
    memoState.resetForm();
  }

  function deleteMemoDirectly(id: string) {
    memoState.delete(id);
  }
</script>

<div
  class="flex h-full flex-col rounded-xl border border-base-300 bg-base-100 shadow-sm max-md:rounded-none max-md:border-none max-md:shadow-none md:rounded-xl md:border md:shadow-sm"
>
  <div
    class="flex items-center justify-between rounded-t-xl border-b border-base-300 bg-base-100 p-4 max-md:rounded-none"
  >
    <h2 class="m-0 text-lg font-normal tracking-wider text-primary uppercase">
      Memo
    </h2>
    <button
      class="btn btn-circle h-10 min-h-10 w-10 text-xl font-medium shadow-sm transition-all duration-200 ease-out btn-primary hover:scale-105 hover:shadow-lg"
      onclick={startNewMemo}
    >
      <span>+</span>
    </button>
  </div>

  {#if showAddForm}
    <div class="border-b border-base-300 bg-base-100 p-4">
      <div class="flex flex-col gap-4">
        <textarea
          bind:value={memoText}
          placeholder="New reminder..."
          rows="3"
          class="textarea w-full resize-none rounded-xl border border-base-300 bg-base-200 p-3 text-base leading-relaxed text-base-content transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
        ></textarea>

        <div class="flex justify-end gap-2">
          <button
            class="btn border border-base-300 text-sm font-medium tracking-wide text-base-content/70 uppercase btn-ghost transition-all duration-200"
            onclick={cancelMemo}>Cancel</button
          >
          <button
            class="btn border-none text-sm font-medium tracking-wide text-primary-content uppercase transition-all duration-200 btn-primary hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            onclick={saveMemo}
            disabled={!memoText.trim()}>Save</button
          >
        </div>
      </div>
    </div>
  {/if}

  <div class="flex-1 overflow-y-auto p-2">
    {#if memoState.memos.length === 0 && !showAddForm}
      <div
        class="flex flex-col items-center justify-center p-12 text-center text-[var(--color-text-muted)]"
      >
        <div class="mb-4 text-5xl opacity-50">📝</div>
        <p class="m-0 mb-2 text-lg font-medium text-base-content/70">
          No notes yet
        </p>
        <p class="m-0 text-sm">Tap + to add your first reminder</p>
      </div>
    {:else}
      {#each memoState.memos as memo (memo.id)}
        <div
          class="mb-2 flex items-center rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-md {editingMemoId ===
          memo.id
            ? 'border-2 border-primary shadow-lg'
            : ''} max-md:p-3"
        >
          {#if editingMemoId === memo.id}
            <div class="mr-4 flex-1">
              <textarea
                bind:value={memoText}
                class="textarea w-full resize-none rounded-xl border border-base-300 bg-base-200 p-3 text-base leading-relaxed text-base-content transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Reminder text..."
                rows="2"
              ></textarea>
            </div>

            <div class="flex gap-2">
              <button
                class="btn btn-circle h-8 min-h-8 w-8 text-sm transition-all duration-200 btn-success hover:scale-110 hover:shadow-lg"
                onclick={saveEditMemo}>✓</button
              >
              <button
                class="btn btn-circle h-8 min-h-8 w-8 text-sm transition-all duration-200 btn-error hover:scale-110 hover:shadow-lg"
                onclick={cancelEditMemo}>✕</button
              >
            </div>
          {:else}
            <div
              class="mr-4 flex-1 cursor-pointer"
              onclick={() => startEditMemo(memo)}
              onkeydown={(e) => e.key === "Enter" && startEditMemo(memo)}
              role="button"
              tabindex="0"
            >
              <div
                class="text-base leading-relaxed break-words whitespace-pre-wrap text-base-content"
              >
                {memo.text}
              </div>
            </div>

            <div
              class="flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-md:opacity-100"
            >
              <button
                class="btn btn-circle h-8 min-h-8 w-8 border border-error bg-transparent text-sm text-error transition-all duration-200 hover:bg-error hover:text-error-content hover:shadow-lg"
                onclick={() => deleteMemoDirectly(memo.id)}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
