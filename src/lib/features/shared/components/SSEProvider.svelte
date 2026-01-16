<script lang="ts">
  import { onMount } from "svelte";
  import { sseClient } from "../services/sse-client";
  import { getDeviceId } from "$lib/utils/device";

  /**
   * SSE Provider Component
   *
   * Place this at the app root to establish SSE connection.
   * Channel handlers should be registered by feature modules
   * before this component mounts.
   */

  onMount(() => {
    const deviceId = getDeviceId();

    // Only connect in browser
    if (deviceId !== "server") {
      sseClient.connect(deviceId);
    }

    return () => {
      sseClient.disconnect();
    };
  });
</script>

<slot />
