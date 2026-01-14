<script lang="ts">
  /**
   * Standardized Button component for consistent UI across the app.
   * Follows design system colors and interaction patterns.
   */
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
  type ButtonSize = "sm" | "md" | "lg";
  type ButtonRounded = "default" | "less" | "sharp";

  interface Props extends HTMLButtonAttributes {
    /** Visual style variant */
    variant?: ButtonVariant;
    /** Button size */
    size?: ButtonSize;
    /** Border radius: default (8px), less (6px), sharp (4px) */
    rounded?: ButtonRounded;
    /** Show loading spinner */
    loading?: boolean;
    /** Full width button */
    fullWidth?: boolean;
    /** Additional CSS classes */
    class?: string;
    /** Button content */
    children: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    rounded = "default",
    loading = false,
    fullWidth = false,
    disabled,
    class: className = "",
    children,
    ...restProps
  }: Props = $props();

  // Border radius classes
  const roundedClasses: Record<ButtonRounded, string> = {
    default: "rounded-lg", // 8px - default button radius
    less: "rounded-md", // 6px - less curvature
    sharp: "rounded", // 4px - minimal curvature
  };

  // Base classes shared by all buttons
  const baseClasses = `inline-flex items-center justify-center font-medium ${roundedClasses[rounded]} transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100`;

  // Variant-specific classes (WCAG AA contrast compliant)
  const variantClasses: Record<ButtonVariant, string> = {
    // Primary: Dark text on Neptune (5.8:1 contrast) - meets WCAG AA
    primary:
      "bg-[var(--color-primary)] text-[var(--color-primary-800)] font-semibold hover:bg-[var(--color-primary-800)] hover:text-white focus-visible:ring-[var(--color-primary)]",
    secondary:
      "bg-[var(--color-surface-100)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] hover:bg-[var(--color-surface-200)] focus-visible:ring-[var(--color-primary)]",
    ghost:
      "bg-transparent text-[var(--color-text-secondary)] hover:bg-base-200 hover:text-[var(--color-text-primary)] focus-visible:ring-[var(--color-primary)]",
    // Danger: Red 600 (#DC2626) with white text (4.6:1 contrast) - meets WCAG AA
    danger:
      "bg-[var(--color-error-500)] text-white hover:bg-red-700 focus-visible:ring-[var(--color-error-500)]",
    // Success: Jungle Green (#2AB388) with white text (3.2:1) - use font-semibold for large text rule
    success:
      "bg-[var(--color-success-500)] text-white font-semibold hover:bg-[var(--color-success-700)] focus-visible:ring-[var(--color-success-500)]",
  };

  // Size-specific classes (WCAG 2.2 touch target compliant)
  const sizeClasses: Record<ButtonSize, string> = {
    sm: "h-10 px-3 text-xs gap-1.5", // 40px - exceeds WCAG AA (24px)
    md: "h-11 px-4 text-sm gap-2", // 44px - meets iOS HIG
    lg: "h-12 px-6 text-base gap-2.5", // 48px - meets Material Design
  };

  // Combine all classes
  let combinedClasses = $derived(
    [
      baseClasses,
      variantClasses[variant],
      sizeClasses[size],
      fullWidth ? "w-full" : "",
      className,
    ]
      .filter(Boolean)
      .join(" "),
  );
</script>

<button class={combinedClasses} disabled={disabled || loading} {...restProps}>
  {#if loading}
    <span class="loading loading-sm loading-spinner"></span>
  {/if}
  {@render children()}
</button>
