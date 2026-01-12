<script lang="ts">
  import { page } from "$app/stores";
  import { FocusIndicator } from "$lib/features/focus/components/index.ts";

  const navItems = [
    { href: "/calendar", label: "Calendar" },
    { href: "/assistant", label: "Assistant" },
    { href: "/tasks", label: "Tasks" },
    { href: "/utilities", label: "Utilities" },
  ] as const;

  function isActive(href: string): boolean {
    return (
      $page.url.pathname === href || $page.url.pathname.startsWith(href + "/")
    );
  }
</script>

<!-- Focus Indicator (shows above nav when tracking) -->
<FocusIndicator />

<div
  class="dock fixed right-0 dock-sm bottom-0 left-0 z-[2000] box-border h-[var(--bottom-nav-height,60px)] border-t border-base-300 bg-base-100/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-md"
  role="navigation"
  aria-label="Main navigation"
>
  {#each navItems as { href, label } (href)}
    <a
      {href}
      class="transition-colors duration-200 {isActive(href)
        ? 'dock-active'
        : ''}"
      aria-current={isActive(href) ? "page" : undefined}
    >
      <span
        class="dock-label text-sm {isActive(href)
          ? 'font-medium text-primary'
          : 'font-normal'}"
      >
        {label}
      </span>
    </a>
  {/each}
</div>
