<script lang="ts">
  /**
   * ProfileEditor Component
   *
   * Allows editing profile fields (display name, stations, status).
   * Used in SettingsPopup under the Account tab.
   */
  import { profileState } from "$lib/bootstrap/index.svelte.ts";
  import { toastState } from "$lib/bootstrap/toast.svelte.ts";
  import {
    Button,
    TextInput,
    StationInput,
  } from "$lib/features/shared/components/index.ts";
  import type {
    StationProfile,
    ProfileStatus,
  } from "$lib/features/utilities/state/profile.svelte.ts";

  let displayName = $state(profileState.displayName ?? "");
  let nearestStation = $state<StationProfile | null>(
    profileState.nearestStation,
  );
  let workplaceStation = $state<StationProfile | null>(
    profileState.workplaceStation,
  );
  let selectedStatus = $state<ProfileStatus | null>(profileState.status);
  let isSaving = $state(false);

  const statusOptions: { value: ProfileStatus; label: string }[] = [
    { value: "学生", label: "学生" },
    { value: "会社員", label: "会社員" },
    { value: "どちらでもない", label: "どちらでもない" },
  ];

  // Sync from profileState when it reloads
  $effect(() => {
    if (profileState.isLoaded) {
      displayName = profileState.displayName ?? "";
      nearestStation = profileState.nearestStation;
      workplaceStation = profileState.workplaceStation;
      selectedStatus = profileState.status;
    }
  });

  function toggleStatus(value: ProfileStatus): void {
    selectedStatus = selectedStatus === value ? null : value;
  }

  async function handleSave(): Promise<void> {
    isSaving = true;
    try {
      await profileState.save({
        displayName: displayName || null,
        nearestStation,
        workplaceStation,
        status: selectedStatus,
      });
      toastState.success("プロフィールを保存しました");
    } catch {
      toastState.error("保存に失敗しました");
    } finally {
      isSaving = false;
    }
  }

  async function handleResetTours(): Promise<void> {
    await profileState.resetTours();
    toastState.success("ツアーをリセットしました");
  }
</script>

<div class="flex flex-col gap-4">
  <TextInput
    label="ユーザー名"
    bind:value={displayName}
    placeholder="表示名を入力"
  />

  <StationInput
    label="最寄り駅"
    bind:selectedStation={nearestStation}
    placeholder="駅名を入力"
  />

  <StationInput
    label="勤務地の最寄り駅"
    bind:selectedStation={workplaceStation}
    placeholder="駅名を入力"
  />

  <div class="flex flex-col gap-1">
    <span class="text-xs font-medium text-base-content/70">ステータス</span>
    <div class="flex gap-2">
      {#each statusOptions as option (option.value)}
        <button
          type="button"
          class="flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-200
						{selectedStatus === option.value
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white shadow-sm'
            : 'border-base-300 bg-base-100 text-base-content/70 hover:border-base-content/30'}"
          onclick={() => toggleStatus(option.value)}
          aria-pressed={selectedStatus === option.value}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>

  <Button
    variant="primary"
    fullWidth
    onclick={handleSave}
    loading={isSaving}
    disabled={isSaving}
  >
    保存
  </Button>

  <!-- Tour reset -->
  <div class="border-t border-base-200 pt-3">
    <button
      type="button"
      class="text-xs text-base-content/50 transition-colors hover:text-base-content/70"
      onclick={handleResetTours}
    >
      ガイドツアーをリセット
    </button>
  </div>
</div>
