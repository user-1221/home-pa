<script lang="ts">
  /**
   * Standardized TextInput component for consistent form styling.
   * Includes error, focus, and disabled states.
   */
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLInputAttributes, "class"> {
    /** Current input value (bindable) */
    value?: string;
    /** Error message to display */
    error?: string;
    /** Input label */
    label?: string;
    /** Helper text below input */
    hint?: string;
    /** Additional CSS classes for the input */
    class?: string;
    /** Additional CSS classes for the wrapper */
    wrapperClass?: string;
  }

  let {
    value = $bindable(""),
    error,
    label,
    hint,
    disabled,
    class: className = "",
    wrapperClass = "",
    ...restProps
  }: Props = $props();

  // Generate unique ID for label association
  const inputId =
    restProps.id ?? `input-${Math.random().toString(36).slice(2, 9)}`;

  // Base input classes
  const baseClasses =
    "w-full rounded-lg border bg-base-100 px-3 py-2 text-sm transition-all duration-200 placeholder:text-base-content/40 focus:outline-none";

  // State-specific classes
  const stateClasses = $derived(() => {
    if (disabled) {
      return "border-base-300 opacity-50 cursor-not-allowed";
    }
    if (error) {
      return "border-[var(--color-error-500)] bg-[var(--color-error-100)]/30 focus:border-[var(--color-error-500)] focus:ring-2 focus:ring-[var(--color-error-500)]/20";
    }
    return "border-base-300 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20";
  });

  let combinedClasses = $derived(
    [baseClasses, stateClasses(), className].filter(Boolean).join(" "),
  );
</script>

<div class="flex flex-col gap-1 {wrapperClass}">
  {#if label}
    <label for={inputId} class="text-xs font-medium text-base-content/70">
      {label}
    </label>
  {/if}

  <input
    id={inputId}
    bind:value
    class={combinedClasses}
    {disabled}
    aria-invalid={error ? "true" : undefined}
    aria-describedby={error
      ? `${inputId}-error`
      : hint
        ? `${inputId}-hint`
        : undefined}
    {...restProps}
  />

  {#if error}
    <p
      id="{inputId}-error"
      class="text-xs text-[var(--color-error-500)]"
      role="alert"
    >
      {error}
    </p>
  {:else if hint}
    <p id="{inputId}-hint" class="text-xs text-base-content/50">
      {hint}
    </p>
  {/if}
</div>
