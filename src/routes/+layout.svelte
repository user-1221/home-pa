<script lang="ts">
  import "../app.css";
  import favicon from "@/assets/favicon.svg";
  import {
    BottomNavigation,
    Toast,
  } from "$lib/features/shared/components/index.ts";
  import SSEProvider from "$lib/features/shared/components/SSEProvider.svelte";
  import {
    initializeStores,
    loadSyncedData,
  } from "$lib/bootstrap/bootstrap.ts";
  import { loadTasks } from "$lib/features/tasks/state/taskActions.svelte.ts";
  import { calendarState } from "$lib/bootstrap/index.svelte.ts";
  import { authClient } from "$lib/auth-client";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  let { children } = $props();

  // Initialize global stores on layout load
  initializeStores();

  const session = authClient.useSession;

  // Public routes that don't require authentication
  const PUBLIC_ROUTES = ["/auth"];

  function isPublicRoute(pathname: string): boolean {
    return PUBLIC_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/"),
    );
  }

  // Load initial data once when authenticated
  let dataLoaded = false;
  $effect(() => {
    const isLoading = $session.isPending;
    const isAuthenticated = !!$session.data?.user;

    if (!isLoading && isAuthenticated && !dataLoaded) {
      dataLoaded = true;

      // Load tasks
      loadTasks();

      // Load calendar events for current window (3 months before/after)
      const now = new Date();
      const windowStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const windowEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0);
      calendarState.fetchEvents(windowStart, windowEnd, true);

      // Load synced data (accepted suggestions, cached transit, etc.)
      loadSyncedData();
    }
  });

  // Client-side auth guard (backup for server-side redirect)
  $effect(() => {
    const isLoading = $session.isPending;
    const isAuthenticated = !!$session.data?.user;
    const pathname = $page.url.pathname;

    if (!isLoading && !isAuthenticated && !isPublicRoute(pathname)) {
      const redirectTo = encodeURIComponent(pathname + $page.url.search);
      goto(`/auth?redirectTo=${redirectTo}`, { replaceState: true });
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#7bbebb" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Etona" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
</svelte:head>

{#if isPublicRoute($page.url.pathname)}
  <div class="flex h-dvh min-h-dvh flex-col overflow-hidden bg-base-100">
    {@render children?.()}
  </div>
{:else}
  <SSEProvider>
    <div class="flex h-dvh min-h-dvh flex-col overflow-hidden bg-base-100">
      <main
        class="flex min-h-0 flex-1 flex-col overflow-auto pb-[calc(var(--bottom-nav-height,60px)+env(safe-area-inset-bottom))]"
      >
        {@render children?.()}
      </main>
      <BottomNavigation />
      <Toast />
    </div>
  </SSEProvider>
{/if}
