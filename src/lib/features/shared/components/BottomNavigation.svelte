<script lang="ts">
  import { page } from "$app/stores";
  import { FocusIndicator } from "$lib/features/focus/components/index.ts";

  interface NavItem {
    href: string;
    label: string;
    outerPath: string; // Outer shape path
    innerPath?: string; // Inner details path (dots, checkmarks, etc.)
  }

  const navItems: NavItem[] = [
    {
      href: "/calendar",
      label: "Calendar",
      outerPath:
        "M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      innerPath: "M8 7V3M16 7V3M3 12h18",
    },
    {
      href: "/assistant",
      label: "Assistant",
      outerPath:
        "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    },
    {
      href: "/tasks",
      label: "Tasks",
      outerPath:
        "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
      innerPath: "M9 14l2 2 4-4",
    },
    {
      href: "/utilities",
      label: "Utilities",
      outerPath:
        "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
    },
  ];

  function isActive(href: string): boolean {
    return (
      $page.url.pathname === href || $page.url.pathname.startsWith(href + "/")
    );
  }
</script>

<!-- Focus Indicator (shows above nav when tracking) -->
<FocusIndicator />

<nav
  class="fixed right-0 bottom-0 left-0 z-[2000] flex h-[var(--bottom-nav-height,60px)] items-center justify-around border-t border-base-300 bg-base-100/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur-md"
  role="navigation"
  aria-label="Main navigation"
>
  {#each navItems as { href, label, outerPath, innerPath } (href)}
    <a
      {href}
      class="group relative flex flex-1 flex-col items-center justify-center gap-1 px-2 py-2 transition-all duration-200"
      aria-current={isActive(href) ? "page" : undefined}
    >
      <!-- Icon -->
      <svg
        class="h-6 w-6 transition-all duration-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <!-- Outer shape -->
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d={outerPath}
          fill={isActive(href) ? "currentColor" : "none"}
          class="transition-all duration-200 {isActive(href)
            ? 'text-primary'
            : 'text-base-content/50 group-hover:text-base-content/70'}"
        />
        <!-- Inner details (white when active) -->
        {#if innerPath}
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d={innerPath}
            fill="none"
            stroke={isActive(href) ? "white" : "currentColor"}
            stroke-width="2"
            class="transition-all duration-200 {isActive(href)
              ? ''
              : 'text-base-content/50 group-hover:text-base-content/70'}"
          />
        {/if}
      </svg>

      <!-- Label -->
      <span
        class="text-[0.65rem] leading-tight font-medium transition-colors duration-200 {isActive(
          href,
        )
          ? 'text-primary'
          : 'text-base-content/50 group-hover:text-base-content/70'}"
      >
        {label}
      </span>
    </a>
  {/each}
</nav>
