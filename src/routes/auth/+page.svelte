<script lang="ts">
  import { authClient } from "$lib/auth-client";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  const session = authClient.useSession;

  let form = $state({ name: "", email: "", password: "" });
  let msg = $state("");
  let mode = $state<"signin" | "signup">("signin");
  let isLoading = $state(false);

  // Get redirect target from URL params
  function getRedirectTo(): string {
    const redirectTo = $page.url.searchParams.get("redirectTo");
    return redirectTo ? decodeURIComponent(redirectTo) : "/";
  }

  // Redirect authenticated users away from auth page
  $effect(() => {
    if ($session.data?.user) {
      goto(getRedirectTo(), { replaceState: true });
    }
  });

  async function signUp() {
    msg = "";
    isLoading = true;
    const { error } = await authClient.signUp.email({
      name: form.name,
      email: form.email,
      password: form.password,
    });
    isLoading = false;
    if (error) {
      msg = error.message || "Sign up failed";
    }
    // Redirect handled by $effect when session updates
  }

  async function signIn() {
    msg = "";
    isLoading = true;
    const { error } = await authClient.signIn.email({
      email: form.email,
      password: form.password,
    });
    isLoading = false;
    if (error) {
      msg = error.message || "Sign in failed";
    }
    // Redirect handled by $effect when session updates
  }

  async function signOut() {
    msg = "";
    isLoading = true;
    const { error } = await authClient.signOut();
    isLoading = false;
    if (error) msg = error.message || "Sign out failed";
  }

  function toggleMode() {
    mode = mode === "signin" ? "signup" : "signin";
    msg = "";
  }

  async function signInWithGoogle() {
    msg = "";
    isLoading = true;
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: getRedirectTo(),
      });
    } catch (err) {
      msg = err instanceof Error ? err.message : "Google sign in failed";
      isLoading = false;
    }
  }
</script>

<div class="flex min-h-screen bg-base-100">
  <!-- Left panel - brand showcase (hidden on mobile) -->
  <div
    class="relative flex flex-[0_0_45%] flex-col justify-center overflow-hidden bg-surface-50 p-16 max-lg:hidden"
  >
    <div class="relative z-10 mx-auto max-w-[420px]">
      <div class="mb-16" in:fade={{ duration: 600, delay: 200 }}>
        <!-- Logo -->
        <img
          src="/favicon.svg"
          alt="flumen logo"
          class="mb-6 h-14 w-14 rounded-xl"
        />
        <h1
          class="m-0 mb-2 text-[2.5rem] leading-tight font-light tracking-tight text-text-primary"
        >
          flumen
        </h1>
        <p class="m-0 text-base font-normal text-text-secondary">
          Your Personal Assistant
        </p>
      </div>

      <div
        class="flex flex-col gap-6"
        in:fly={{ y: 20, duration: 600, delay: 400, easing: cubicOut }}
      >
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-lg text-primary-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h3 class="m-0 mb-1 text-base font-medium text-text-primary">
              Smart Calendar
            </h3>
            <p class="m-0 text-sm leading-relaxed text-text-muted">
              Organize your schedule effortlessly
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-lg text-primary-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 class="m-0 mb-1 text-base font-medium text-text-primary">
              Task Management
            </h3>
            <p class="m-0 text-sm leading-relaxed text-text-muted">
              Stay on top of your todos
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 text-lg text-primary-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <div>
            <h3 class="m-0 mb-1 text-base font-medium text-text-primary">
              AI Assistant
            </h3>
            <p class="m-0 text-sm leading-relaxed text-text-muted">
              Get intelligent help anytime
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Right panel - auth form -->
  <div class="flex flex-1 items-center justify-center p-8 max-sm:p-6">
    {#if $session.data?.user}
      <div
        class="w-full max-w-[400px] rounded-xl border border-base-300 bg-base-100 p-8 shadow-sm"
        in:fade={{ duration: 400 }}
      >
        <h2
          class="m-0 mb-3 text-2xl font-light tracking-tight text-text-primary"
        >
          Welcome back!
        </h2>
        <p class="m-0 mb-6 text-sm text-text-secondary">
          Signed in as <strong class="font-medium text-text-primary"
            >{$session.data.user.email}</strong
          >
        </p>
        <button
          class="btn h-11 border-none bg-primary text-primary-content transition-colors duration-200 hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          onclick={signOut}
          disabled={isLoading}
        >
          {isLoading ? "Signing out..." : "Sign out"}
        </button>
      </div>
    {:else}
      <div
        class="w-full max-w-[400px] rounded-xl border border-base-300 bg-base-100 p-8 shadow-sm max-sm:border-0 max-sm:shadow-none"
        in:fly={{ y: 30, duration: 600, delay: 300, easing: cubicOut }}
      >
        <!-- Mobile logo -->
        <div class="mb-6 flex items-center gap-3 lg:hidden">
          <img
            src="/favicon.svg"
            alt="flumen logo"
            class="h-10 w-10 rounded-lg"
          />
          <span class="text-lg font-light text-text-primary">flumen</span>
        </div>

        <div class="mb-8">
          <h2
            class="m-0 mb-2 text-2xl font-light tracking-tight text-text-primary max-sm:text-xl"
          >
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h2>
          <p class="m-0 text-sm leading-relaxed text-text-secondary">
            {mode === "signin"
              ? "Sign in to continue to your personal assistant"
              : "Join to start organizing your life"}
          </p>
        </div>

        <form
          class="flex flex-col gap-5"
          onsubmit={(e: SubmitEvent) => {
            e.preventDefault();
            if (mode === "signin") {
              signIn();
            } else {
              signUp();
            }
          }}
        >
          {#if mode === "signup"}
            <div class="flex flex-col gap-2" in:fly={{ x: -20, duration: 300 }}>
              <label for="name" class="text-xs font-medium text-text-secondary"
                >Name</label
              >
              <input
                id="name"
                type="text"
                class="input-bordered input h-11 rounded-lg border border-base-300 bg-base-100 px-3 text-sm text-text-primary transition-colors duration-200 placeholder:text-text-muted focus:border-primary focus:outline-none"
                placeholder="Your name"
                bind:value={form.name}
                required
              />
            </div>
          {/if}

          <div class="flex flex-col gap-2">
            <label for="email" class="text-xs font-medium text-text-secondary"
              >Email</label
            >
            <input
              id="email"
              type="email"
              class="input-bordered input h-11 rounded-lg border border-base-300 bg-base-100 px-3 text-sm text-text-primary transition-colors duration-200 placeholder:text-text-muted focus:border-primary focus:outline-none"
              placeholder="you@example.com"
              bind:value={form.email}
              required
            />
          </div>

          <div class="flex flex-col gap-2">
            <label
              for="password"
              class="text-xs font-medium text-text-secondary">Password</label
            >
            <input
              id="password"
              type="password"
              class="input-bordered input h-11 rounded-lg border border-base-300 bg-base-100 px-3 text-sm text-text-primary transition-colors duration-200 placeholder:text-text-muted focus:border-primary focus:outline-none"
              placeholder="Enter your password"
              bind:value={form.password}
              required
            />
          </div>

          {#if msg}
            <div
              class="rounded-lg border border-error/30 bg-error-100 px-4 py-3 text-sm leading-relaxed text-error"
              in:fly={{ y: -10, duration: 300 }}
            >
              {msg}
            </div>
          {/if}

          <button
            type="submit"
            class="btn mt-2 h-11 border-none bg-primary text-sm font-medium text-primary-content shadow-none transition-colors duration-200 hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
          >
            {#if isLoading}
              <span
                class="h-4 w-4 animate-spin rounded-full border-2 border-primary-content/30 border-t-primary-content"
              ></span>
              <span
                >{mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."}</span
              >
            {:else}
              {mode === "signin" ? "Sign in" : "Create account"}
            {/if}
          </button>
        </form>

        <!-- Divider -->
        <div class="my-6 flex items-center gap-3">
          <div class="h-px flex-1 bg-base-300"></div>
          <span class="text-xs text-text-muted">or continue with</span>
          <div class="h-px flex-1 bg-base-300"></div>
        </div>

        <!-- Google Sign In Button -->
        <button
          type="button"
          class="btn h-11 w-full gap-3 border border-base-300 bg-base-100 text-sm font-medium text-text-primary shadow-none transition-colors duration-200 hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-60"
          onclick={signInWithGoogle}
          disabled={isLoading}
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google
        </button>

        <div class="mt-6 border-t border-base-300 pt-6 text-center">
          <p class="m-0 text-sm text-text-secondary">
            {mode === "signin"
              ? "Don't have an account?"
              : "Already have an account?"}
            <button
              class="ml-1 cursor-pointer border-none bg-transparent p-0 font-medium text-primary transition-colors duration-200 hover:text-primary-800 hover:underline"
              onclick={toggleMode}
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>
