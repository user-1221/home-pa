<script lang="ts">
  /**
   * SettingsPopup Component
   *
   * Modal popup for app settings including account, import/export.
   * Opens from settings icon in UtilitiesView.
   */

  import { calendarState } from "$lib/bootstrap/index.svelte.ts";
  import {
    UserSettings,
    Button,
    SlidingTabs,
  } from "$lib/features/shared/components/index.ts";
  import { googleSyncState } from "$lib/features/calendar/state/google-sync.svelte.ts";
  import { authClient } from "$lib/auth-client.ts";
  import CalendarSelector from "$lib/features/calendar/components/CalendarSelector.svelte";
  import ProfileEditor from "./ProfileEditor.svelte";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  const { open, onClose }: Props = $props();

  // Import/Export State
  let importing = $state(false);
  let importResult = $state<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  let fileInputRef: HTMLInputElement | undefined = $state();
  let showAdvanced = $state(false);
  let exportName = $state("flumen Calendar");

  const isApiEnabled = $state(true);

  // Tab state
  type Tab = "account" | "data";
  let activeTab = $state<Tab>("account");

  const tabs = [
    { id: "account" as const, label: "アカウント" },
    { id: "data" as const, label: "データ" },
  ];

  // Google Calendar Sync state
  let calendarSelectorAccount = $state<{
    id: string;
    email: string;
  } | null>(null);
  let isSyncing = $state(false);
  let syncError = $state<string | null>(null);
  const session = authClient.useSession;

  // Check Google connection when popup opens
  $effect(() => {
    if (open) {
      googleSyncState.checkConnection();
    }
  });

  async function connectGoogle() {
    try {
      await googleSyncState.connectNewAccount();
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Failed to connect";
    }
  }

  async function handleSync() {
    isSyncing = true;
    syncError = null;
    try {
      await googleSyncState.triggerSync();
      calendarState.clear();
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Sync failed";
    } finally {
      isSyncing = false;
    }
  }

  async function handleRemoveAccount(accountId: string) {
    if (
      !confirm(
        "このGoogleアカウントを削除しますか？同期したイベントはそのまま残ります。",
      )
    ) {
      return;
    }
    try {
      await googleSyncState.removeAccount(accountId);
    } catch (err) {
      syncError =
        err instanceof Error ? err.message : "Failed to remove account";
    }
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!file.name.endsWith(".ics") && file.type !== "text/calendar") {
      importResult = {
        imported: 0,
        skipped: 0,
        errors: ["Please select a valid .ics file"],
      };
      return;
    }

    importing = true;
    importResult = null;

    try {
      const result = await calendarState.importICS(file);
      importResult = result;
    } catch (error) {
      importResult = {
        imported: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : "Import failed"],
      };
    } finally {
      importing = false;
      if (fileInputRef) {
        fileInputRef.value = "";
      }
    }
  }

  function handleExport() {
    const url = calendarState.getExportUrl(undefined, undefined, exportName);
    window.location.href = url;
  }

  function triggerFileInput() {
    fileInputRef?.click();
  }

  function clearImportResult() {
    importResult = null;
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="modal-open modal-mobile-fullscreen modal z-[2100] md:modal-middle"
    role="button"
    tabindex="-1"
    aria-label="Close settings"
    onclick={handleBackdropClick}
  >
    <div
      class="modal-box flex h-full w-full max-w-lg flex-col overflow-hidden p-0 md:h-auto md:max-h-[85vh]"
    >
      <!-- Header -->
      <div
        class="flex flex-shrink-0 items-center justify-between border-b border-base-300 bg-base-100 px-5 py-4"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-100)]"
          >
            <svg
              class="h-4 w-4 text-[var(--color-primary)]"
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
          </div>
          <h2 class="text-base font-medium tracking-tight">設定</h2>
        </div>
        <button
          class="btn btn-circle text-base-content/60 btn-ghost btn-sm hover:text-base-content"
          onclick={onClose}
          aria-label="Close"
        >
          <svg
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

      <!-- Tabs -->
      <div class="flex-shrink-0 border-b border-base-300 px-5 py-3">
        <SlidingTabs
          {tabs}
          selected={activeTab}
          onSelect={(id) => (activeTab = id as Tab)}
        />
      </div>

      <!-- Content -->
      <div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        {#if activeTab === "account"}
          <!-- Account Tab -->
          <div class="flex flex-col gap-4">
            <!-- Profile Section -->
            <div class="rounded-xl border border-base-200 bg-base-100 p-4">
              <div class="mb-3 flex items-center gap-2">
                <svg
                  class="h-4 w-4 text-[var(--color-text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span
                  class="text-xs font-medium text-[var(--color-text-secondary)]"
                  >プロフィール</span
                >
              </div>
              <ProfileEditor />
            </div>

            <!-- Google Calendar Sync Section -->
            <div class="rounded-xl border border-base-200 bg-base-100 p-4">
              <div class="mb-3 flex items-center gap-2">
                <svg
                  class="h-4 w-4 text-[var(--color-text-secondary)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span
                  class="text-xs font-medium text-[var(--color-text-secondary)]"
                  >Google Calendar</span
                >
              </div>

              <div class="flex flex-col gap-3">
                {#if !$session.data?.user}
                  <p class="text-sm text-base-content/60">
                    アカウントにサインインしてGoogle
                    Calendarを連携してください。
                  </p>
                {:else if googleSyncState.isConnected}
                  <!-- Connected State -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-sm text-success">
                      <svg
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span
                        >連携済み ({googleSyncState.accounts
                          .length}アカウント)</span
                      >
                    </div>
                    <!-- Add New Account button -->
                    <button
                      class="btn gap-1 btn-ghost btn-xs"
                      onclick={connectGoogle}
                      title="別のGoogleアカウントを追加"
                    >
                      <svg
                        class="h-4 w-4"
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

                  <!-- Accounts grouped view -->
                  {#each googleSyncState.accounts as account (account.id)}
                    <div class="rounded-lg border border-base-200 p-3">
                      <!-- Account Header -->
                      <div class="mb-2 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span
                            class="max-w-[180px] truncate text-sm font-medium text-base-content/80"
                          >
                            {account.email}
                          </span>
                          {#if !account.isValid}
                            <span class="badge badge-xs badge-error"
                              >要再認証</span
                            >
                          {/if}
                        </div>
                        <!-- Account actions dropdown -->
                        <div class="dropdown dropdown-end">
                          <button class="btn btn-ghost btn-xs" tabindex="0">
                            <svg
                              class="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                              />
                            </svg>
                          </button>
                          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                          <ul
                            class="dropdown-content menu z-10 w-40 rounded-box bg-base-100 p-1 shadow-lg"
                            tabindex="0"
                          >
                            <li>
                              <button
                                onclick={() =>
                                  (calendarSelectorAccount = {
                                    id: account.id,
                                    email: account.email,
                                  })}
                              >
                                カレンダー管理
                              </button>
                            </li>
                            <li>
                              <button
                                class="text-error"
                                onclick={() => handleRemoveAccount(account.id)}
                              >
                                削除
                              </button>
                            </li>
                          </ul>
                        </div>
                      </div>

                      <!-- Calendars for this account -->
                      {#if account.calendars.length > 0}
                        <div class="space-y-1">
                          {#each account.calendars as calendar (calendar.id)}
                            <div class="flex items-center gap-2 text-sm">
                              {#if calendar.calendarColor}
                                <span
                                  class="h-3 w-3 flex-shrink-0 rounded-full {!calendar.syncEnabled
                                    ? 'opacity-40'
                                    : ''}"
                                  style="background-color: {calendar.calendarColor}"
                                ></span>
                              {/if}
                              <span
                                class="flex-1 truncate text-base-content/80 {!calendar.syncEnabled
                                  ? 'line-through opacity-50'
                                  : ''}"
                              >
                                {calendar.calendarName}
                              </span>
                              {#if !calendar.syncEnabled}
                                <span class="text-xs text-base-content/50"
                                  >無効</span
                                >
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <button
                          class="text-xs text-[var(--color-primary)] hover:underline"
                          onclick={() =>
                            (calendarSelectorAccount = {
                              id: account.id,
                              email: account.email,
                            })}
                        >
                          カレンダーを選択
                        </button>
                      {/if}
                    </div>
                  {/each}

                  <Button
                    variant="secondary"
                    fullWidth
                    onclick={handleSync}
                    disabled={isSyncing ||
                      googleSyncState.enabledCalendars.length === 0}
                    loading={isSyncing}
                  >
                    <svg
                      class="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {isSyncing ? "同期中..." : "今すぐ同期"}
                  </Button>

                  {#if googleSyncState.lastSyncAt}
                    <p class="text-xs text-base-content/50">
                      最終同期: {googleSyncState.lastSyncAt.toLocaleString(
                        "ja-JP",
                      )}
                    </p>
                  {/if}
                {:else}
                  <!-- Not Connected -->
                  <Button variant="secondary" fullWidth onclick={connectGoogle}>
                    <svg class="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Google Calendarを連携
                  </Button>
                {/if}

                {#if syncError}
                  <div
                    class="rounded-lg bg-error/10 px-3 py-2 text-sm text-error"
                  >
                    {syncError}
                  </div>
                {/if}
              </div>
            </div>

            <!-- User Profile Card -->
            <div
              class="card bg-gradient-to-br from-primary to-primary/80 text-primary-content shadow-lg"
            >
              <div class="card-body p-5">
                <UserSettings />
              </div>
            </div>
          </div>
        {:else}
          <!-- Data Tab -->
          <div class="flex flex-col gap-4">
            <!-- Import Section -->
            <div class="rounded-xl border border-base-200 bg-base-100 p-4">
              <div class="mb-3 flex items-center gap-2">
                <svg
                  class="h-4 w-4 text-[var(--color-text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <span
                  class="text-xs font-medium text-[var(--color-text-secondary)]"
                  >インポート</span
                >
              </div>
              <p class="mb-3 text-sm text-[var(--color-text-secondary)]">
                Google Calendar、Apple
                Calendar、その他の.icsファイルからインポート。
              </p>

              <input
                type="file"
                accept=".ics,text/calendar"
                onchange={handleFileSelect}
                bind:this={fileInputRef}
                class="hidden"
                disabled={importing || !isApiEnabled}
              />

              <Button
                variant="secondary"
                fullWidth
                onclick={triggerFileInput}
                disabled={importing || !isApiEnabled}
                loading={importing}
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                {importing ? "インポート中..." : ".icsファイルを選択"}
              </Button>

              {#if importResult}
                <div
                  class="mt-3 rounded-lg p-3 {importResult.errors.length > 0
                    ? 'bg-error/10 text-error'
                    : 'bg-success/10 text-success'}"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="text-sm">
                      {#if importResult.imported > 0}
                        <p>✓ {importResult.imported}件のイベントをインポート</p>
                      {/if}
                      {#if importResult.skipped > 0}
                        <p>{importResult.skipped}件の重複をスキップ</p>
                      {/if}
                      {#if importResult.errors.length > 0}
                        {#each importResult.errors as error, idx (idx)}
                          <p>{error}</p>
                        {/each}
                      {/if}
                    </div>
                    <button
                      class="text-base-content/50 hover:text-base-content"
                      onclick={clearImportResult}
                      aria-label="閉じる"
                    >
                      ×
                    </button>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Export Section -->
            <div class="rounded-xl border border-base-200 bg-base-100 p-4">
              <div class="mb-3 flex items-center gap-2">
                <svg
                  class="h-4 w-4 text-[var(--color-text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span
                  class="text-xs font-medium text-[var(--color-text-secondary)]"
                  >エクスポート</span
                >
              </div>
              <p class="mb-3 text-sm text-[var(--color-text-secondary)]">
                すべてのイベントを.icsファイルとしてダウンロード。
              </p>

              <button
                class="mb-2 flex items-center gap-1 text-xs text-[var(--color-text-secondary)] hover:text-base-content"
                onclick={() => (showAdvanced = !showAdvanced)}
              >
                <svg
                  class="h-3 w-3 transition-transform duration-150 {showAdvanced
                    ? 'rotate-90'
                    : ''}"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                詳細設定
              </button>

              {#if showAdvanced}
                <div class="mb-3">
                  <label
                    class="mb-1 block text-xs text-[var(--color-text-muted)]"
                    >カレンダー名</label
                  >
                  <input
                    type="text"
                    class="input input-sm w-full border-base-300 bg-base-100 focus:border-[var(--color-primary)] focus:outline-none"
                    bind:value={exportName}
                    placeholder="flumen Calendar"
                  />
                </div>
              {/if}

              <Button
                variant="secondary"
                fullWidth
                onclick={handleExport}
                disabled={!isApiEnabled}
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                .icsファイルをダウンロード
              </Button>
            </div>
          </div>
        {/if}
      </div>
    </div>
    <div class="modal-backdrop bg-black/40 backdrop-blur-sm"></div>
  </div>
{/if}

{#if calendarSelectorAccount}
  <CalendarSelector
    accountId={calendarSelectorAccount.id}
    accountEmail={calendarSelectorAccount.email}
    onClose={() => {
      calendarSelectorAccount = null;
      onClose();
    }}
  />
{/if}
