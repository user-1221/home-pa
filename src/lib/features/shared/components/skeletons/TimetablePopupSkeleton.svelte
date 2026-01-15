<script lang="ts">
  /**
   * TimetablePopupSkeleton Component
   *
   * Skeleton placeholder specifically for TimetablePopup.
   * Matches the layout: header, config row, 5x5 grid table.
   */

  import Skeleton from "../Skeleton.svelte";

  const weekdays = ["月", "火", "水", "木", "金"];
  const SLOTS_PER_DAY = 5;
</script>

<div class="modal-open modal-mobile-fullscreen modal z-[2100] md:modal-middle">
  <div
    class="modal-box h-full w-full max-w-4xl overflow-hidden p-0 md:h-auto md:w-11/12"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between border-b border-base-300 px-5 py-4"
    >
      <div class="flex items-center gap-3">
        <Skeleton variant="circle" width="36px" height="36px" />
        <Skeleton variant="text" width="100px" height="20px" />
      </div>
      <Skeleton variant="circle" width="32px" height="32px" />
    </div>

    <!-- Config section -->
    <div class="border-b border-base-300 bg-base-200/30 px-5 py-4">
      <div class="mb-3">
        <Skeleton variant="text" width="80px" height="14px" />
      </div>
      <div class="grid grid-cols-5 gap-3">
        {#each Array(5) as _, i (i)}
          <div class="flex flex-col gap-1">
            <Skeleton variant="text" width="60px" height="12px" />
            <Skeleton variant="text" width="100%" height="32px" />
          </div>
        {/each}
      </div>
    </div>

    <!-- Timetable grid -->
    <div class="overflow-auto px-5 py-4">
      <table class="table w-full table-fixed">
        <thead>
          <tr class="border-b border-base-300">
            <th class="w-16">
              <Skeleton variant="text" width="30px" height="14px" />
            </th>
            {#each weekdays as day (day)}
              <th class="text-center">
                <span class="text-sm font-medium text-base-content/40"
                  >{day}</span
                >
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each Array(SLOTS_PER_DAY) as _, slotIndex (slotIndex)}
            <tr class="border-b border-base-200/60">
              <td class="py-2">
                <Skeleton variant="text" width="50px" height="12px" />
              </td>
              {#each Array(5) as _, dayIndex (dayIndex)}
                <td class="p-1.5">
                  <Skeleton variant="card" width="100%" height="56px" />
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Exception ranges section -->
    <div class="border-t border-base-300 px-5 py-4">
      <div class="mb-3">
        <Skeleton variant="text" width="120px" height="14px" />
      </div>
      <Skeleton variant="text" width="100%" height="40px" />
    </div>
  </div>
  <div class="modal-backdrop bg-black/40 backdrop-blur-sm"></div>
</div>
