<script lang="ts">
  import UtilitiesView from "$lib/features/utilities/components/UtilitiesView.svelte";
  import { onMount } from "svelte";
  import { startTourIfNew } from "$lib/features/shared/tour/tour-driver.ts";
  import { utilitiesTourSteps } from "$lib/features/utilities/tour/utilities-tour.ts";

  onMount(() => {
    setTimeout(() => startTourIfNew("utilities", utilitiesTourSteps), 500);
  });
</script>

<UtilitiesView />
