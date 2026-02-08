<script lang="ts">
  import { TaskView } from "$lib/features/tasks/components/index.ts";
  import { onMount } from "svelte";
  import { startTourIfNew } from "$lib/features/shared/tour/tour-driver.ts";
  import { tasksTourSteps } from "$lib/features/tasks/tour/tasks-tour.ts";

  onMount(() => {
    setTimeout(() => startTourIfNew("tasks", tasksTourSteps), 500);
  });
</script>

<TaskView />
