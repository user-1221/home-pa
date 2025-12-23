<script lang="ts">
  import "../app.css";
  import favicon from "@/assets/favicon.svg";
  import {
    BottomNavigation,
    Toast,
  } from "$lib/features/shared/components/index.ts";
  import { initializeStores } from "$lib/bootstrap/bootstrap.ts";
  import { loadTasks } from "$lib/features/tasks/state/taskActions.ts";
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

  // Load tasks once when authenticated
  let tasksLoaded = false;
  $effect(() => {
    const isLoading = $session.isPending;
    const isAuthenticated = !!$session.data?.user;

    if (!isLoading && isAuthenticated && !tasksLoaded) {
      tasksLoaded = true;
      loadTasks();
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
</svelte:head>

{#if isPublicRoute($page.url.pathname)}
  <div class="flex h-dvh min-h-dvh flex-col overflow-hidden bg-base-100">
    {@render children?.()}
  </div>
{:else}
  <div class="flex h-dvh min-h-dvh flex-col overflow-hidden bg-base-100">
    <main class="flex flex-1 flex-col overflow-auto pb-[calc(var(--bottom-nav-height,60px)+env(safe-area-inset-bottom))]">
      {@render children?.()}
    </main>
    <BottomNavigation />
    <Toast />
  </div>
{/if}
