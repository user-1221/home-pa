<script lang="ts">
  interface Props {
    id: string;
    value: string;
    label?: string;
    class?: string;
    active?: boolean; // Whether this picker is currently active
    disabled?: boolean; // Whether the picker is disabled (greyed out)
    onclick?: () => void;
  }

  let {
    id,
    value = $bindable(""),
    label,
    class: className = "",
    active = false,
    disabled = false,
    onclick,
  }: Props = $props();

  // Format display value
  let displayValue = $derived(() => {
    if (!value) return "日付を選択";
    const [year, month, day] = value.split("-");
    return `${year}/${month}/${day}`;
  });
</script>

<div class="flex flex-col {className}">
  {#if label}
    <label class="label" for={id}>
      <span class="label-text text-sm text-[var(--color-text-secondary)]"
        >{label}</span
      >
    </label>
  {/if}

  <button
    type="button"
    id="{id}-btn"
    class="input-bordered input flex items-center justify-between text-left transition-colors {className.includes(
      'w-auto',
    )
      ? 'w-auto min-w-[140px]'
      : 'w-full'} {active
      ? 'ring-opacity-30 border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]'
      : ''} {disabled ? 'cursor-not-allowed opacity-50' : ''}"
    onclick={disabled ? undefined : onclick}
    {disabled}
  >
    <span class={value ? "" : "text-base-content/50"}>{displayValue()}</span>
    <svg
      class="h-4 w-4 fill-current opacity-60"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
    >
      <path
        d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
      />
    </svg>
  </button>
</div>
