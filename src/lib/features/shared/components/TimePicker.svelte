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

  // Format display value (HH:mm format)
  let displayValue = $derived(() => {
    if (!value) return "時間を選択";
    // value is in HH:mm format, just return it
    return value;
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
      ? 'w-auto min-w-[120px]'
      : 'w-full'} {active
      ? 'ring-opacity-30 border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]'
      : ''} {disabled ? 'cursor-not-allowed bg-base-200' : ''}"
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
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
      />
    </svg>
  </button>
</div>
