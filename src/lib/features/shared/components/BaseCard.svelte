<script lang="ts">
  let p: {
    title: string;
    status?: string;
    statusType?: "active" | "inactive" | "warning" | "error" | "success";
    class?: string;
    children?: import("svelte").Snippet;
  } = $props();
</script>

<div
  class="rounded-xl border border-base-300 bg-base-200 p-6 shadow-sm transition-all duration-200 ease-out focus-within:shadow-md hover:shadow-md md:p-4 {p.class ??
    ''}"
>
  <div
    class="mb-4 flex items-center justify-between border-b border-base-300 pb-3 max-[480px]:flex-col max-[480px]:items-start max-[480px]:gap-2"
  >
    <h3 class="m-0 text-lg font-medium tracking-normal text-base-content">
      {p.title}
    </h3>
    {#if p.status}
      <div class="flex items-center">
        <span
          class="rounded-lg border px-3 py-1.5 text-sm font-normal {p.statusType ===
            'active' || !p.statusType
            ? 'border-primary bg-primary/10 text-primary'
            : ''} {p.statusType === 'inactive'
            ? 'border-base-300 bg-base-200 text-base-content/50'
            : ''} {p.statusType === 'warning'
            ? 'border-warning bg-warning/10 text-warning'
            : ''} {p.statusType === 'error'
            ? 'border-error bg-error/10 text-error'
            : ''} {p.statusType === 'success'
            ? 'border-success bg-success/10 text-success'
            : ''}"
        >
          {p.status}
        </span>
      </div>
    {/if}
  </div>

  <div class="min-h-[200px]">
    {@render p.children?.()}
  </div>
</div>
