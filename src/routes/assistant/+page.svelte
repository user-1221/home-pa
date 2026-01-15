<script lang="ts">
  import LazyLoad from "$lib/features/shared/components/LazyLoad.svelte";
  import AssistantPageSkeleton from "$lib/features/shared/components/skeletons/AssistantPageSkeleton.svelte";
</script>

<LazyLoad
  loader={() =>
    import("$lib/features/assistant/components/PersonalAssistantView.svelte")}
>
  <AssistantPageSkeleton />
</LazyLoad>
