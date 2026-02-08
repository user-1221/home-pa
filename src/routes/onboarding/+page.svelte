<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { profileState } from "$lib/bootstrap/index.svelte.ts";
  import {
    Button,
    TextInput,
    StationInput,
  } from "$lib/features/shared/components/index.ts";
  import type {
    StationProfile,
    ProfileStatus,
  } from "$lib/features/utilities/state/profile.svelte.ts";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  const session = authClient.useSession;

  // Form state (local, form-scoped)
  let displayName = $state("");
  let nearestStation = $state<StationProfile | null>(null);
  let workplaceStation = $state<StationProfile | null>(null);
  let selectedStatus = $state<ProfileStatus | null>(null);
  let isSaving = $state(false);
  let errorMsg = $state("");

  const statusOptions: { value: ProfileStatus; label: string }[] = [
    { value: "学生", label: "学生" },
    { value: "会社員", label: "会社員" },
    { value: "どちらでもない", label: "どちらでもない" },
  ];

  // Auth guard — redirect to /auth if not authenticated
  $effect(() => {
    const isLoading = $session.isPending;
    const isAuthenticated = !!$session.data?.user;

    if (!isLoading && !isAuthenticated) {
      goto("/auth?redirectTo=/onboarding", { replaceState: true });
    }
  });

  // Redirect if already onboarded
  $effect(() => {
    if (profileState.isLoaded && profileState.onboardingCompleted) {
      goto("/", { replaceState: true });
    }
  });

  function toggleStatus(value: ProfileStatus): void {
    selectedStatus = selectedStatus === value ? null : value;
  }

  async function handleSave(): Promise<void> {
    isSaving = true;
    errorMsg = "";

    try {
      await profileState.save({
        displayName: displayName || null,
        nearestStation,
        workplaceStation,
        status: selectedStatus,
        markOnboardingComplete: true,
      });
      goto("/", { replaceState: true });
    } catch (err) {
      console.error("[Onboarding] Save failed:", err);
      errorMsg = "保存に失敗しました。もう一度お試しください。";
      isSaving = false;
    }
  }

  async function handleSkip(): Promise<void> {
    isSaving = true;
    errorMsg = "";

    try {
      await profileState.markOnboardingComplete();
      goto("/", { replaceState: true });
    } catch (err) {
      console.error("[Onboarding] Skip failed:", err);
      errorMsg = "エラーが発生しました。もう一度お試しください。";
      isSaving = false;
    }
  }

  // Check if any field has been filled
  const hasAnyInput = $derived(
    !!displayName || !!nearestStation || !!workplaceStation || !!selectedStatus,
  );
</script>

<div
  class="flex min-h-dvh items-center justify-center bg-base-100 p-6"
  in:fade={{ duration: 400 }}
>
  <div class="w-full max-w-[440px]">
    <!-- Welcome header -->
    <div
      class="mb-8"
      in:fly={{ y: 20, duration: 600, delay: 200, easing: cubicOut }}
    >
      <div
        class="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary"
      >
        <span class="text-2xl font-medium text-primary-content">H</span>
      </div>
      <h1 class="m-0 mb-2 text-2xl font-light tracking-tight text-text-primary">
        ようこそ Home-PA へ
      </h1>
      <p class="m-0 text-sm leading-relaxed text-text-secondary">
        プロフィールを設定しましょう。すべて任意なので、スキップしても構いません。
      </p>
    </div>

    <!-- Form -->
    <form
      class="flex flex-col gap-6"
      in:fly={{ y: 20, duration: 600, delay: 400, easing: cubicOut }}
      onsubmit={(e: SubmitEvent) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <!-- ユーザー名 -->
      <TextInput
        label="ユーザー名"
        bind:value={displayName}
        placeholder="表示名を入力"
      />

      <!-- 最寄り駅 -->
      <StationInput
        label="最寄り駅"
        bind:selectedStation={nearestStation}
        placeholder="駅名を入力"
      />

      <!-- 勤務地の最寄り駅 -->
      <StationInput
        label="勤務地の最寄り駅"
        bind:selectedStation={workplaceStation}
        placeholder="駅名を入力"
      />

      <!-- ステータス -->
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-base-content/70">
          ステータス
        </span>
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

      <!-- Error message -->
      {#if errorMsg}
        <div
          class="rounded-lg border border-error/30 bg-error-100 px-4 py-3 text-sm leading-relaxed text-error"
          in:fly={{ y: -10, duration: 300 }}
        >
          {errorMsg}
        </div>
      {/if}

      <!-- Actions -->
      <div class="mt-2 flex flex-col gap-3">
        <Button
          variant="primary"
          fullWidth
          onclick={handleSave}
          loading={isSaving}
          disabled={isSaving}
        >
          {hasAnyInput ? "保存してはじめる" : "はじめる"}
        </Button>
        <Button
          variant="ghost"
          fullWidth
          onclick={handleSkip}
          disabled={isSaving}
        >
          スキップ
        </Button>
      </div>
    </form>
  </div>
</div>
