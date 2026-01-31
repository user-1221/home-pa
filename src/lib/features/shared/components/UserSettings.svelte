<script lang="ts">
  /**
   * UserSettings Component
   *
   * Displays user authentication status and provides login/signup/logout functionality
   */

  import { authClient } from "$lib/auth-client.ts";

  const session = authClient.useSession;

  let form = $state({ name: "", email: "", password: "" });
  let msg = $state("");
  let showSignUp = $state(false);
  let isLoading = $state(false);

  async function signInWithGoogle() {
    msg = "";
    isLoading = true;
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
    } catch (err) {
      msg = err instanceof Error ? err.message : "Google sign in failed";
      isLoading = false;
    }
  }

  async function signUp() {
    msg = "";
    isLoading = true;
    try {
      const { error } = await authClient.signUp.email({
        name: form.name,
        email: form.email,
        password: form.password,
      });
      if (error) {
        msg = error.message || "Sign up failed";
      } else {
        msg = "Account created! You are now signed in.";
        form = { name: "", email: "", password: "" };
        showSignUp = false;
      }
    } finally {
      isLoading = false;
    }
  }

  async function signIn() {
    msg = "";
    isLoading = true;
    try {
      const { error } = await authClient.signIn.email({
        email: form.email,
        password: form.password,
      });
      if (error) {
        msg = error.message || "Sign in failed";
      } else {
        msg = "";
        form = { name: "", email: "", password: "" };
      }
    } finally {
      isLoading = false;
    }
  }

  async function signOut() {
    msg = "";
    isLoading = true;
    try {
      const { error } = await authClient.signOut();
      if (error) {
        msg = error.message || "Sign out failed";
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  {#if $session.data?.user}
    <!-- Logged In State -->
    <div
      class="flex items-center gap-4 rounded-xl bg-base-100/20 p-4 backdrop-blur-sm"
    >
      <div class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full">
        {#if $session.data.user.image}
          <img
            src={$session.data.user.image}
            alt="Profile"
            class="h-full w-full object-cover"
          />
        {:else}
          <span
            class="flex h-full w-full items-center justify-center bg-base-100/30 text-xl font-medium text-base-100"
          >
            {$session.data.user.name?.charAt(0).toUpperCase() ||
              $session.data.user.email?.charAt(0).toUpperCase() ||
              "?"}
          </span>
        {/if}
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <span
          class="overflow-hidden font-medium text-ellipsis whitespace-nowrap text-base-100"
        >
          {$session.data.user.name || "User"}
        </span>
        <span
          class="overflow-hidden text-sm font-normal text-ellipsis whitespace-nowrap text-base-100/80"
        >
          {$session.data.user.email}
        </span>
      </div>
    </div>

    <div
      class="flex flex-col gap-1 rounded-xl bg-base-100/20 p-3 backdrop-blur-sm"
    >
      <span class="text-sm font-medium text-base-100">● Connected</span>
      <span class="text-xs font-normal text-base-100/70"
        >Your calendar syncs to the cloud</span
      >
    </div>

    <button
      class="min-h-[44px] w-full cursor-pointer rounded-xl border-2 border-base-100/30 bg-transparent px-4 py-3 font-normal text-base-100 transition-all duration-200 ease-out hover:border-base-100 hover:bg-base-100/10 disabled:cursor-not-allowed disabled:opacity-50"
      onclick={signOut}
      disabled={isLoading}
    >
      {isLoading ? "Signing out..." : "Sign Out"}
    </button>
  {:else}
    <!-- Logged Out State -->
    <div
      class="rounded-xl bg-base-100/20 p-4 text-sm text-base-100/90 backdrop-blur-sm"
    >
      <p class="m-0">
        Sign in to sync your calendar across devices and enable import/export
        features.
      </p>
    </div>

    {#if showSignUp}
      <!-- Sign Up Form -->
      <form
        class="flex flex-col gap-3"
        onsubmit={(e: SubmitEvent) => {
          e.preventDefault();
          signUp();
        }}
      >
        <input
          type="text"
          placeholder="Name"
          bind:value={form.name}
          disabled={isLoading}
          required
          class="min-h-[44px] w-full rounded-xl border-2 border-base-100/30 bg-base-100/10 px-4 text-base-100 backdrop-blur-sm transition-colors duration-200 placeholder:text-base-100/60 focus:border-base-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="email"
          placeholder="Email"
          bind:value={form.email}
          disabled={isLoading}
          required
          class="min-h-[44px] w-full rounded-xl border-2 border-base-100/30 bg-base-100/10 px-4 text-base-100 backdrop-blur-sm transition-colors duration-200 placeholder:text-base-100/60 focus:border-base-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="password"
          placeholder="Password"
          bind:value={form.password}
          disabled={isLoading}
          required
          minlength="6"
          class="min-h-[44px] w-full rounded-xl border-2 border-base-100/30 bg-base-100/10 px-4 text-base-100 backdrop-blur-sm transition-colors duration-200 placeholder:text-base-100/60 focus:border-base-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          class="btn min-h-[44px] rounded-xl border-none bg-base-100 font-normal text-primary shadow-sm transition-all duration-200 ease-out hover:bg-base-100/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? "Creating account..." : "Create Account"}
        </button>
        <button
          type="button"
          class="min-h-[44px] cursor-pointer border-none bg-transparent text-sm font-normal text-base-100/90 underline transition-colors duration-200 ease-out hover:text-base-100"
          onclick={() => {
            showSignUp = false;
            msg = "";
          }}
        >
          Already have an account? Sign In
        </button>
      </form>

      <!-- Divider -->
      <div class="flex items-center gap-3">
        <div class="h-px flex-1 bg-base-100/30"></div>
        <span class="text-xs text-base-100/60">or</span>
        <div class="h-px flex-1 bg-base-100/30"></div>
      </div>

      <!-- Google Sign In Button -->
      <button
        type="button"
        class="btn min-h-[44px] w-full gap-3 rounded-xl border-2 border-base-100/30 bg-transparent font-normal text-base-100 transition-all hover:border-base-100 hover:bg-base-100/10 disabled:cursor-not-allowed disabled:opacity-50"
        onclick={signInWithGoogle}
        disabled={isLoading}
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24">
          <path
            fill="#fff"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#fff"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#fff"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#fff"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </button>
    {:else}
      <!-- Sign In Form -->
      <form
        class="flex flex-col gap-3"
        onsubmit={(e: SubmitEvent) => {
          e.preventDefault();
          signIn();
        }}
      >
        <input
          type="email"
          placeholder="Email"
          bind:value={form.email}
          disabled={isLoading}
          required
          class="min-h-[44px] w-full rounded-xl border-2 border-base-100/30 bg-base-100/10 px-4 text-base-100 backdrop-blur-sm transition-colors duration-200 placeholder:text-base-100/60 focus:border-base-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="password"
          placeholder="Password"
          bind:value={form.password}
          disabled={isLoading}
          required
          class="min-h-[44px] w-full rounded-xl border-2 border-base-100/30 bg-base-100/10 px-4 text-base-100 backdrop-blur-sm transition-colors duration-200 placeholder:text-base-100/60 focus:border-base-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          class="btn min-h-[44px] rounded-xl border-none bg-base-100 font-normal text-primary shadow-sm transition-all duration-200 ease-out hover:bg-base-100/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </button>
        <button
          type="button"
          class="min-h-[44px] cursor-pointer border-none bg-transparent text-sm font-normal text-base-100/90 underline transition-colors duration-200 ease-out hover:text-base-100"
          onclick={() => {
            showSignUp = true;
            msg = "";
          }}
        >
          Don't have an account? Sign Up
        </button>
      </form>

      <!-- Divider -->
      <div class="flex items-center gap-3">
        <div class="h-px flex-1 bg-base-100/30"></div>
        <span class="text-xs text-base-100/60">or</span>
        <div class="h-px flex-1 bg-base-100/30"></div>
      </div>

      <!-- Google Sign In Button -->
      <button
        type="button"
        class="btn min-h-[44px] w-full gap-3 rounded-xl border-2 border-base-100/30 bg-transparent font-normal text-base-100 transition-all hover:border-base-100 hover:bg-base-100/10 disabled:cursor-not-allowed disabled:opacity-50"
        onclick={signInWithGoogle}
        disabled={isLoading}
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24">
          <path
            fill="#fff"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#fff"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#fff"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#fff"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </button>
    {/if}
  {/if}

  {#if msg}
    <div
      class="rounded-xl px-4 py-3 text-sm {msg.includes('failed') ||
      msg.includes('error')
        ? 'bg-error/20 text-base-100'
        : 'bg-base-100/20 text-base-100'}"
    >
      {msg}
    </div>
  {/if}
</div>
