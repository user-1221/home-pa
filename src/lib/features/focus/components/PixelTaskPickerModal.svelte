<script lang="ts">
  /**
   * PixelTaskPickerModal Component
   *
   * Pixel-art styled modal for selecting tasks (quests).
   * Features wood frame decoration, cork board background, and parchment-styled task items.
   */

  import type { Memo } from "$lib/types.ts";

  interface Props {
    open: boolean;
    tasks: Memo[];
    currentSuggestionId?: string | null;
    onSelect: (task: Memo) => void;
    onClose: () => void;
  }

  const {
    open,
    tasks,
    currentSuggestionId = null,
    onSelect,
    onClose,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="pixel-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="task-picker-title"
  >
    <div class="modal-panel">
      <!-- Decorative Wood Frame SVG Background -->
      <svg
        class="modal-frame-svg"
        viewBox="0 0 200 300"
        preserveAspectRatio="none"
      >
        <!-- Wood Frame - Top -->
        <rect x="0" y="0" width="200" height="12" fill="#8B6B4A" />
        <rect x="0" y="0" width="200" height="2" fill="#C4956A" />
        <rect x="0" y="2" width="200" height="2" fill="#B8896A" />
        <rect x="0" y="4" width="200" height="2" fill="#A87D5A" />
        <rect x="0" y="6" width="200" height="2" fill="#9B6B4A" />
        <rect x="0" y="8" width="200" height="2" fill="#8B5B3A" />
        <rect x="0" y="10" width="200" height="2" fill="#7D5640" />
        <!-- Top grain details -->
        <rect x="15" y="1" width="6" height="2" fill="#D4A57A" />
        <rect x="45" y="3" width="4" height="2" fill="#9B6B4A" />
        <rect x="80" y="0" width="8" height="2" fill="#D8B080" />
        <rect x="120" y="2" width="5" height="2" fill="#A87850" />
        <rect x="160" y="1" width="6" height="2" fill="#D4A070" />

        <!-- Wood Frame - Bottom -->
        <rect x="0" y="288" width="200" height="12" fill="#7D5640" />
        <rect x="0" y="288" width="200" height="2" fill="#8B6B4A" />
        <rect x="0" y="290" width="200" height="2" fill="#7D5640" />
        <rect x="0" y="292" width="200" height="2" fill="#6D4830" />
        <rect x="0" y="294" width="200" height="2" fill="#5D4028" />
        <rect x="0" y="296" width="200" height="2" fill="#4D3520" />
        <rect x="0" y="298" width="200" height="2" fill="#3D2A18" />
        <!-- Bottom grain -->
        <rect x="25" y="289" width="5" height="2" fill="#9B7B5A" />
        <rect x="90" y="291" width="6" height="2" fill="#6D4830" />
        <rect x="150" y="290" width="4" height="2" fill="#9B7B5A" />

        <!-- Wood Frame - Left -->
        <rect x="0" y="12" width="12" height="276" fill="#9B7B5A" />
        <rect x="0" y="12" width="2" height="276" fill="#C4956A" />
        <rect x="2" y="12" width="2" height="276" fill="#B8896A" />
        <rect x="4" y="12" width="2" height="276" fill="#A87D5A" />
        <rect x="6" y="12" width="2" height="276" fill="#9B6B4A" />
        <rect x="8" y="12" width="2" height="276" fill="#8B5B3A" />
        <rect x="10" y="12" width="2" height="276" fill="#7D5640" />
        <!-- Left grain -->
        <rect x="1" y="30" width="2" height="5" fill="#D4A57A" />
        <rect x="1" y="80" width="2" height="4" fill="#D8B080" />
        <rect x="3" y="140" width="2" height="6" fill="#8B5030" />
        <rect x="1" y="200" width="2" height="5" fill="#D4A57A" />
        <rect x="5" y="250" width="2" height="4" fill="#6D4028" />

        <!-- Wood Frame - Right -->
        <rect x="188" y="12" width="12" height="276" fill="#6D4830" />
        <rect x="188" y="12" width="2" height="276" fill="#8B5B3A" />
        <rect x="190" y="12" width="2" height="276" fill="#7D5640" />
        <rect x="192" y="12" width="2" height="276" fill="#6D4830" />
        <rect x="194" y="12" width="2" height="276" fill="#5D4028" />
        <rect x="196" y="12" width="2" height="276" fill="#4D3520" />
        <rect x="198" y="12" width="2" height="276" fill="#3D2A18" />
        <!-- Right grain -->
        <rect x="189" y="50" width="2" height="4" fill="#9B6B4A" />
        <rect x="193" y="120" width="2" height="5" fill="#4D3018" />
        <rect x="189" y="180" width="2" height="4" fill="#9B6B4A" />
        <rect x="191" y="240" width="2" height="4" fill="#5D3820" />

        <!-- Cork Board Background -->
        <rect x="12" y="12" width="176" height="276" fill="#C4956A" />
        <rect x="12" y="12" width="176" height="92" fill="#D4A070" />
        <rect x="12" y="104" width="176" height="92" fill="#C4956A" />
        <rect x="12" y="196" width="176" height="92" fill="#B88B60" />

        <!-- Cork pores/texture -->
        <rect x="20" y="20" width="3" height="3" fill="#B8896A" />
        <rect x="50" y="25" width="2" height="2" fill="#A87D5A" />
        <rect x="90" y="18" width="3" height="2" fill="#D8B080" />
        <rect x="130" y="30" width="2" height="3" fill="#9B7B5A" />
        <rect x="170" y="22" width="2" height="2" fill="#E0B888" />
        <rect x="35" y="50" width="2" height="2" fill="#A88060" />
        <rect x="75" y="45" width="2" height="2" fill="#987048" />
        <rect x="115" y="55" width="3" height="2" fill="#D4A070" />
        <rect x="155" y="48" width="2" height="2" fill="#B89060" />
        <rect x="25" y="80" width="2" height="2" fill="#C4956A" />
        <rect x="65" y="75" width="2" height="3" fill="#A87850" />
        <rect x="105" y="85" width="3" height="2" fill="#D8B080" />
        <rect x="145" y="78" width="2" height="2" fill="#9B7B5A" />
        <rect x="40" y="120" width="2" height="2" fill="#9B7B5A" />
        <rect x="80" y="115" width="3" height="2" fill="#D4A070" />
        <rect x="120" y="125" width="2" height="3" fill="#B89060" />
        <rect x="160" y="118" width="2" height="2" fill="#A87D5A" />
        <rect x="30" y="160" width="2" height="2" fill="#B8896A" />
        <rect x="70" y="155" width="2" height="2" fill="#9B7B5A" />
        <rect x="110" y="165" width="3" height="2" fill="#C49060" />
        <rect x="150" y="158" width="2" height="2" fill="#987048" />
        <rect x="45" y="200" width="2" height="2" fill="#A87D5A" />
        <rect x="85" y="195" width="2" height="3" fill="#C4956A" />
        <rect x="125" y="205" width="2" height="2" fill="#9B7B5A" />
        <rect x="165" y="198" width="3" height="2" fill="#B8896A" />
        <rect x="25" y="240" width="2" height="2" fill="#9B7B5A" />
        <rect x="65" y="235" width="2" height="2" fill="#A87D5A" />
        <rect x="105" y="245" width="3" height="2" fill="#B8896A" />
        <rect x="145" y="238" width="2" height="3" fill="#987048" />
        <rect x="55" y="270" width="2" height="2" fill="#C4956A" />
        <rect x="95" y="265" width="2" height="2" fill="#9B6B4A" />
        <rect x="135" y="275" width="3" height="2" fill="#A88060" />

        <!-- Brass corner tacks -->
        <rect x="4" y="4" width="4" height="4" fill="#D8B070" />
        <rect x="4" y="4" width="2" height="2" fill="#E8C888" />
        <rect x="6" y="6" width="2" height="2" fill="#B89050" />
        <rect x="192" y="4" width="4" height="4" fill="#B89050" />
        <rect x="192" y="4" width="2" height="2" fill="#D8B070" />
        <rect x="194" y="6" width="2" height="2" fill="#987040" />
        <rect x="4" y="292" width="4" height="4" fill="#C4A060" />
        <rect x="4" y="292" width="2" height="2" fill="#D8B070" />
        <rect x="6" y="294" width="2" height="2" fill="#A88050" />
        <rect x="192" y="292" width="4" height="4" fill="#A88050" />
        <rect x="192" y="292" width="2" height="2" fill="#C4A060" />
        <rect x="194" y="294" width="2" height="2" fill="#886030" />
      </svg>

      <!-- Modal Header with detailed wood plank SVG -->
      <div class="modal-header">
        <!-- Wood plank background SVG -->
        <svg
          class="modal-header-bg"
          viewBox="0 0 400 60"
          preserveAspectRatio="none"
        >
          <!-- Main wood plank -->
          <rect x="0" y="0" width="400" height="60" fill="#8B5B3A" />
          <!-- Wood grain horizontal bands -->
          <rect x="0" y="0" width="400" height="4" fill="#A87D5A" />
          <rect x="0" y="4" width="400" height="3" fill="#9B6B4A" />
          <rect x="0" y="7" width="400" height="2" fill="#8B5B3A" />
          <rect x="0" y="12" width="400" height="2" fill="#7D5030" />
          <rect x="0" y="18" width="400" height="3" fill="#9B6B4A" />
          <rect x="0" y="24" width="400" height="2" fill="#6D4828" />
          <rect x="0" y="30" width="400" height="2" fill="#8B5B3A" />
          <rect x="0" y="36" width="400" height="3" fill="#7D5030" />
          <rect x="0" y="42" width="400" height="2" fill="#9B6B4A" />
          <rect x="0" y="48" width="400" height="2" fill="#6D4828" />
          <rect x="0" y="54" width="400" height="3" fill="#7D5030" />
          <rect x="0" y="57" width="400" height="3" fill="#5D4028" />
          <!-- Vertical grain streaks -->
          <rect
            x="20"
            y="0"
            width="2"
            height="60"
            fill="#9B7B5A"
            opacity="0.3"
          />
          <rect
            x="60"
            y="0"
            width="3"
            height="60"
            fill="#7D5030"
            opacity="0.4"
          />
          <rect
            x="110"
            y="0"
            width="2"
            height="60"
            fill="#A87D5A"
            opacity="0.3"
          />
          <rect
            x="150"
            y="0"
            width="2"
            height="60"
            fill="#6D4828"
            opacity="0.4"
          />
          <rect
            x="200"
            y="0"
            width="3"
            height="60"
            fill="#9B7B5A"
            opacity="0.3"
          />
          <rect
            x="250"
            y="0"
            width="2"
            height="60"
            fill="#7D5030"
            opacity="0.4"
          />
          <rect
            x="300"
            y="0"
            width="2"
            height="60"
            fill="#A87D5A"
            opacity="0.3"
          />
          <rect
            x="350"
            y="0"
            width="3"
            height="60"
            fill="#6D4828"
            opacity="0.4"
          />
          <!-- Wood knots -->
          <ellipse cx="45" cy="25" rx="6" ry="8" fill="#5D4028" />
          <ellipse cx="45" cy="25" rx="4" ry="5" fill="#4D3520" />
          <ellipse cx="45" cy="24" rx="2" ry="3" fill="#3D2A18" />
          <ellipse cx="180" cy="40" rx="5" ry="6" fill="#5D4028" />
          <ellipse cx="180" cy="40" rx="3" ry="4" fill="#4D3520" />
          <ellipse cx="320" cy="20" rx="7" ry="9" fill="#5D4028" />
          <ellipse cx="320" cy="20" rx="5" ry="6" fill="#4D3520" />
          <ellipse cx="320" cy="19" rx="2" ry="3" fill="#3D2A18" />
          <!-- Highlight streaks -->
          <rect x="0" y="0" width="400" height="2" fill="#B8896A" />
          <rect x="75" y="8" width="30" height="1" fill="#A87D5A" />
          <rect x="160" y="15" width="40" height="1" fill="#9B7B5A" />
          <rect x="280" y="10" width="25" height="1" fill="#A87D5A" />
          <!-- Shadow at bottom -->
          <rect x="0" y="56" width="400" height="4" fill="#4D3520" />
          <!-- Nail heads -->
          <circle cx="12" cy="30" r="4" fill="#6D6D6D" />
          <circle cx="12" cy="30" r="3" fill="#8B8B8B" />
          <rect x="10" y="28" width="2" height="2" fill="#ABABAB" />
          <circle cx="388" cy="30" r="4" fill="#5D5D5D" />
          <circle cx="388" cy="30" r="3" fill="#7B7B7B" />
          <rect x="386" y="28" width="2" height="2" fill="#9B9B9B" />
        </svg>

        <div class="modal-header-content">
          <!-- Detailed scroll/banner icon -->
          <svg class="modal-title-icon" viewBox="0 0 32 32" fill="none">
            <!-- Scroll roll top -->
            <rect x="4" y="2" width="24" height="4" fill="#D8B070" />
            <rect x="4" y="2" width="24" height="1" fill="#F0D898" />
            <rect x="4" y="3" width="24" height="1" fill="#E8C888" />
            <rect x="4" y="5" width="24" height="1" fill="#C4A060" />
            <rect x="2" y="3" width="2" height="2" fill="#C4A060" />
            <rect x="28" y="3" width="2" height="2" fill="#B89050" />
            <!-- Scroll body -->
            <rect x="5" y="6" width="22" height="20" fill="#E9D8B8" />
            <rect x="5" y="6" width="22" height="1" fill="#F5EED8" />
            <!-- Parchment texture -->
            <rect x="8" y="8" width="3" height="1" fill="#D8C098" />
            <rect x="16" y="10" width="4" height="1" fill="#C4A880" />
            <rect x="10" y="14" width="2" height="1" fill="#D0B488" />
            <rect x="20" y="18" width="3" height="1" fill="#C49C6C" />
            <rect x="12" y="22" width="2" height="1" fill="#D8C098" />
            <!-- Text lines -->
            <rect x="8" y="9" width="16" height="2" fill="#583524" />
            <rect x="8" y="13" width="12" height="2" fill="#70402A" />
            <rect x="8" y="17" width="14" height="2" fill="#583524" />
            <rect x="8" y="21" width="10" height="2" fill="#70402A" />
            <!-- Scroll roll bottom -->
            <rect x="4" y="26" width="24" height="4" fill="#C4A060" />
            <rect x="4" y="26" width="24" height="1" fill="#D8B070" />
            <rect x="4" y="28" width="24" height="1" fill="#B89050" />
            <rect x="4" y="29" width="24" height="1" fill="#A88050" />
            <rect x="2" y="27" width="2" height="2" fill="#B89050" />
            <rect x="28" y="27" width="2" height="2" fill="#987040" />
          </svg>
          <span id="task-picker-title">QUEST LIST</span>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg class="close-icon" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="2" height="2" />
            <rect x="5" y="5" width="2" height="2" />
            <rect x="7" y="7" width="2" height="2" />
            <rect x="9" y="5" width="2" height="2" />
            <rect x="11" y="3" width="2" height="2" />
            <rect x="5" y="9" width="2" height="2" />
            <rect x="3" y="11" width="2" height="2" />
            <rect x="9" y="9" width="2" height="2" />
            <rect x="11" y="11" width="2" height="2" />
          </svg>
        </button>
      </div>

      <!-- Task List -->
      <div class="modal-body">
        {#if tasks.length === 0}
          <div class="empty-state">
            <!-- Empty scroll illustration -->
            <svg class="empty-scroll-icon" viewBox="0 0 64 64" fill="none">
              <!-- Scroll background -->
              <rect x="12" y="8" width="40" height="48" fill="#E9D8B8" />
              <!-- Scroll top roll -->
              <rect x="10" y="4" width="44" height="6" fill="#D8B070" />
              <rect x="10" y="4" width="44" height="2" fill="#E8C888" />
              <rect x="10" y="8" width="44" height="2" fill="#C4A060" />
              <!-- Scroll bottom roll -->
              <rect x="10" y="54" width="44" height="6" fill="#C4A060" />
              <rect x="10" y="54" width="44" height="2" fill="#D8B070" />
              <rect x="10" y="58" width="44" height="2" fill="#B89050" />
              <!-- Sad face -->
              <rect x="22" y="22" width="4" height="4" fill="#8A5C3A" />
              <rect x="38" y="22" width="4" height="4" fill="#8A5C3A" />
              <rect x="24" y="38" width="16" height="2" fill="#8A5C3A" />
              <rect x="22" y="36" width="4" height="2" fill="#8A5C3A" />
              <rect x="38" y="36" width="4" height="2" fill="#8A5C3A" />
              <!-- Stain marks -->
              <rect x="16" y="16" width="4" height="2" fill="#D8C098" />
              <rect x="44" y="28" width="4" height="2" fill="#C4A880" />
              <rect x="18" y="44" width="3" height="2" fill="#D0B488" />
            </svg>
            <span>NO QUESTS AVAILABLE</span>
          </div>
        {:else}
          <div class="quest-list">
            {#each tasks as task (task.id)}
              <button class="quest-item" onclick={() => onSelect(task)}>
                <!-- Detailed parchment paper background -->
                <svg
                  class="quest-item-bg"
                  viewBox="0 0 400 80"
                  preserveAspectRatio="none"
                >
                  <!-- Deep paper shadow (layered for depth) -->
                  <rect x="6" y="6" width="390" height="70" fill="#8A5C3A" />
                  <rect x="5" y="5" width="391" height="71" fill="#A86C44" />

                  <!-- Parchment base with gradient bands -->
                  <rect x="0" y="0" width="396" height="76" fill="#E9D8B8" />
                  <rect x="0" y="0" width="396" height="20" fill="#F0E0C8" />
                  <rect x="0" y="20" width="396" height="20" fill="#E9D8B8" />
                  <rect x="0" y="40" width="396" height="20" fill="#E0D0B0" />
                  <rect x="0" y="60" width="396" height="16" fill="#D8C8A8" />

                  <!-- Edge highlight (top-left lighting) -->
                  <rect x="0" y="0" width="396" height="2" fill="#F8F0E0" />
                  <rect x="0" y="0" width="2" height="76" fill="#F5EED8" />

                  <!-- Edge shadow (bottom-right) -->
                  <rect x="394" y="0" width="2" height="76" fill="#C4A880" />
                  <rect x="0" y="74" width="396" height="2" fill="#C49C6C" />

                  <!-- Top edge chips/tears -->
                  <rect x="12" y="0" width="5" height="3" fill="#D4B898" />
                  <rect x="13" y="3" width="3" height="2" fill="#C4A880" />
                  <rect x="45" y="0" width="3" height="2" fill="#C49C6C" />
                  <rect x="80" y="0" width="6" height="3" fill="#D8C098" />
                  <rect x="82" y="3" width="3" height="2" fill="#C4A880" />
                  <rect x="130" y="0" width="4" height="2" fill="#B0885A" />
                  <rect x="175" y="0" width="5" height="3" fill="#D4B898" />
                  <rect x="220" y="0" width="3" height="2" fill="#C49C6C" />
                  <rect x="270" y="0" width="6" height="3" fill="#D8C098" />
                  <rect x="272" y="3" width="2" height="2" fill="#C4A880" />
                  <rect x="320" y="0" width="4" height="2" fill="#B0885A" />
                  <rect x="365" y="0" width="5" height="3" fill="#D4B898" />

                  <!-- Bottom edge tears -->
                  <rect x="20" y="73" width="4" height="3" fill="#A86C44" />
                  <rect x="21" y="71" width="2" height="2" fill="#B88860" />
                  <rect x="90" y="74" width="5" height="2" fill="#9B6B4A" />
                  <rect x="160" y="73" width="3" height="3" fill="#A86C44" />
                  <rect x="240" y="74" width="4" height="2" fill="#9B6B4A" />
                  <rect x="310" y="73" width="5" height="3" fill="#A86C44" />
                  <rect x="312" y="71" width="2" height="2" fill="#B88860" />
                  <rect x="375" y="74" width="4" height="2" fill="#9B6B4A" />

                  <!-- Left edge wear -->
                  <rect x="0" y="15" width="3" height="4" fill="#C4A880" />
                  <rect x="0" y="40" width="2" height="5" fill="#D4B898" />
                  <rect x="0" y="60" width="3" height="3" fill="#C49C6C" />

                  <!-- Right edge wear -->
                  <rect x="393" y="20" width="3" height="4" fill="#B0885A" />
                  <rect x="394" y="45" width="2" height="5" fill="#C4A880" />
                  <rect x="393" y="65" width="3" height="4" fill="#B0885A" />

                  <!-- Curled corner (bottom right) -->
                  <rect x="386" y="66" width="6" height="6" fill="#C4A880" />
                  <rect x="388" y="68" width="6" height="6" fill="#B0885A" />
                  <rect x="390" y="70" width="6" height="6" fill="#9B6B4A" />
                  <rect x="392" y="72" width="4" height="4" fill="#8A5C3A" />

                  <!-- Stain marks (coffee/tea rings, water damage) -->
                  <ellipse
                    cx="35"
                    cy="20"
                    rx="8"
                    ry="6"
                    fill="#D8C098"
                    opacity="0.6"
                  />
                  <ellipse
                    cx="35"
                    cy="20"
                    rx="5"
                    ry="4"
                    fill="#E0D0B0"
                    opacity="0.4"
                  />
                  <rect
                    x="70"
                    y="35"
                    width="8"
                    height="5"
                    fill="#C4A880"
                    opacity="0.5"
                  />
                  <rect
                    x="72"
                    y="37"
                    width="4"
                    height="2"
                    fill="#D0B488"
                    opacity="0.4"
                  />
                  <ellipse
                    cx="140"
                    cy="55"
                    rx="10"
                    ry="7"
                    fill="#D4B898"
                    opacity="0.5"
                  />
                  <rect
                    x="190"
                    y="15"
                    width="6"
                    height="4"
                    fill="#C49C6C"
                    opacity="0.6"
                  />
                  <ellipse
                    cx="250"
                    cy="40"
                    rx="7"
                    ry="5"
                    fill="#D8C098"
                    opacity="0.5"
                  />
                  <rect
                    x="300"
                    y="25"
                    width="9"
                    height="5"
                    fill="#C4A880"
                    opacity="0.5"
                  />
                  <ellipse
                    cx="355"
                    cy="60"
                    rx="8"
                    ry="5"
                    fill="#D0B488"
                    opacity="0.5"
                  />

                  <!-- Age spots / foxing -->
                  <rect
                    x="25"
                    y="45"
                    width="2"
                    height="2"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="60"
                    y="15"
                    width="2"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />
                  <rect
                    x="100"
                    y="55"
                    width="3"
                    height="2"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="150"
                    y="25"
                    width="2"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />
                  <rect
                    x="210"
                    y="50"
                    width="2"
                    height="3"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="260"
                    y="20"
                    width="3"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />
                  <rect
                    x="330"
                    y="45"
                    width="2"
                    height="2"
                    fill="#C4A070"
                    opacity="0.6"
                  />
                  <rect
                    x="370"
                    y="30"
                    width="2"
                    height="2"
                    fill="#B89060"
                    opacity="0.5"
                  />

                  <!-- Center fold crease (vertical) -->
                  <rect
                    x="196"
                    y="0"
                    width="1"
                    height="76"
                    fill="#D8C098"
                    opacity="0.7"
                  />
                  <rect
                    x="197"
                    y="0"
                    width="2"
                    height="76"
                    fill="#C4A880"
                    opacity="0.5"
                  />
                  <rect
                    x="199"
                    y="0"
                    width="1"
                    height="76"
                    fill="#D4B898"
                    opacity="0.3"
                  />

                  <!-- Horizontal fold creases -->
                  <rect
                    x="0"
                    y="25"
                    width="396"
                    height="1"
                    fill="#D8C098"
                    opacity="0.4"
                  />
                  <rect
                    x="0"
                    y="26"
                    width="396"
                    height="1"
                    fill="#C4A880"
                    opacity="0.3"
                  />
                  <rect
                    x="0"
                    y="50"
                    width="396"
                    height="1"
                    fill="#D8C098"
                    opacity="0.4"
                  />
                  <rect
                    x="0"
                    y="51"
                    width="396"
                    height="1"
                    fill="#C4A880"
                    opacity="0.3"
                  />

                  <!-- Fiber texture lines -->
                  <rect
                    x="10"
                    y="10"
                    width="40"
                    height="1"
                    fill="#D4B898"
                    opacity="0.3"
                  />
                  <rect
                    x="80"
                    y="30"
                    width="50"
                    height="1"
                    fill="#C4A880"
                    opacity="0.25"
                  />
                  <rect
                    x="200"
                    y="15"
                    width="45"
                    height="1"
                    fill="#D8C098"
                    opacity="0.3"
                  />
                  <rect
                    x="280"
                    y="45"
                    width="55"
                    height="1"
                    fill="#C4A880"
                    opacity="0.25"
                  />
                  <rect
                    x="50"
                    y="60"
                    width="40"
                    height="1"
                    fill="#D4B898"
                    opacity="0.3"
                  />
                  <rect
                    x="320"
                    y="65"
                    width="35"
                    height="1"
                    fill="#C4A880"
                    opacity="0.25"
                  />
                </svg>

                <!-- Detailed pin decoration -->
                <div
                  class="quest-pin"
                  style="--pin-color: {task.type === 'ルーティン'
                    ? '#40A040'
                    : task.type === '期限付き'
                      ? '#D8B070'
                      : '#4080D0'}; --pin-shadow: {task.type === 'ルーティン'
                    ? '#206020'
                    : task.type === '期限付き'
                      ? '#987040'
                      : '#204080'}; --pin-highlight: {task.type === 'ルーティン'
                    ? '#70D070'
                    : task.type === '期限付き'
                      ? '#F0E0A0'
                      : '#90C8F8'}"
                >
                  <svg viewBox="0 0 16 16" fill="none">
                    <!-- Pin shadow on paper -->
                    <ellipse
                      cx="9"
                      cy="10"
                      rx="4"
                      ry="2"
                      fill="#8A5C3A"
                      opacity="0.3"
                    />
                    <!-- Pin base (metallic ring) -->
                    <circle cx="8" cy="7" r="6" fill="var(--pin-shadow)" />
                    <circle cx="8" cy="7" r="5" fill="var(--pin-color)" />
                    <!-- Pin top highlight -->
                    <circle
                      cx="8"
                      cy="6"
                      r="4"
                      fill="var(--pin-highlight)"
                      opacity="0.4"
                    />
                    <circle cx="6" cy="5" r="2" fill="white" opacity="0.5" />
                    <!-- Pin center (pushed in) -->
                    <circle cx="8" cy="7" r="2" fill="var(--pin-shadow)" />
                    <rect
                      x="7"
                      y="6"
                      width="1"
                      height="1"
                      fill="var(--pin-color)"
                      opacity="0.5"
                    />
                  </svg>
                </div>

                <div
                  class="quest-icon {task.type === 'ルーティン'
                    ? 'quest-routine'
                    : task.type === '期限付き'
                      ? 'quest-deadline'
                      : 'quest-normal'}"
                >
                  {task.title.charAt(0).toUpperCase()}
                </div>
                <div class="quest-info">
                  <span class="quest-name">{task.title}</span>
                  <span class="quest-type">{task.type}</span>
                </div>
                {#if task.id === currentSuggestionId}
                  <span class="quest-badge">NOW</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="modal-backdrop"
      role="button"
      tabindex="-1"
      aria-label="Close"
      onclick={onClose}
    ></div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     MODAL - Task picker (painterly wood frame with fine details)
     ═══════════════════════════════════════════════════════════════════════════ */
  .pixel-modal {
    position: fixed;
    inset: 0;
    z-index: 2200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal-backdrop {
    position: absolute;
    inset: 0;
    background: oklch(var(--bc) / 0.75);
    backdrop-filter: blur(2px);
  }

  .modal-panel {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 420px;
    max-height: 75vh;
    overflow: hidden;
  }

  .modal-frame-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    pointer-events: none;
  }

  .modal-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    margin: 12px 12px 0;
    overflow: hidden;
  }

  .modal-header-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    pointer-events: none;
  }

  .modal-header-content {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 1;
  }

  .modal-title-icon {
    width: 32px;
    height: 32px;
    image-rendering: pixelated;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.4));
  }

  .modal-header #task-picker-title {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.15em;
    color: #fff8ed;
    text-shadow:
      2px 2px 0 #3d2a18,
      3px 3px 0 rgba(0, 0, 0, 0.3),
      -1px -1px 0 rgba(255, 255, 255, 0.15);
  }

  .close-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #9b6b4a 0%, #7d5640 50%, #5d4028 100%);
    border: 4px solid #4d3520;
    border-top-color: #b8896a;
    border-left-color: #b8896a;
    color: #fff8ed;
    cursor: pointer;
    transition: all 0.1s ease;
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.2),
      inset -1px -1px 0 rgba(0, 0, 0, 0.2),
      2px 2px 0 rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  .close-btn .close-icon {
    width: 16px;
    height: 16px;
  }

  .close-btn:hover {
    background: linear-gradient(135deg, #d04040 0%, #a02020 50%, #701010 100%);
    border-color: #501010;
    border-top-color: #f06060;
    border-left-color: #f06060;
  }

  .close-btn:active {
    border-top-color: #501010;
    border-left-color: #501010;
    border-bottom-color: #f06060;
    border-right-color: #f06060;
    box-shadow:
      inset 2px 2px 0 rgba(0, 0, 0, 0.3),
      1px 1px 0 rgba(0, 0, 0, 0.2);
  }

  .modal-body {
    position: relative;
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    margin: 8px 12px 12px;
    scrollbar-width: thin;
    scrollbar-color: #9b6b4a #c4956a;
  }

  .modal-body::-webkit-scrollbar {
    width: 10px;
  }

  .modal-body::-webkit-scrollbar-track {
    background: #c4956a;
    border: 2px solid #9b6b4a;
  }

  .modal-body::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #9b6b4a 0%, #7d5640 100%);
    border: 2px solid #5a3d2b;
    border-top-color: #b8896a;
    border-left-color: #b8896a;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: #5a3d2b;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.3);
  }

  .empty-scroll-icon {
    width: 80px;
    height: 80px;
    image-rendering: pixelated;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.15));
  }

  .quest-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .quest-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 72px;
    padding: 16px 20px 16px 44px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
  }

  .quest-item-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    pointer-events: none;
  }

  .quest-item:active .quest-item-bg {
    filter: brightness(0.98);
  }

  .quest-pin {
    position: absolute;
    top: 6px;
    left: 10px;
    width: 22px;
    height: 22px;
    z-index: 2;
    color: #fff8ed;
    filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.25));
    image-rendering: pixelated;
  }

  .quest-pin svg {
    width: 100%;
    height: 100%;
  }

  .quest-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    font-size: 16px;
    font-weight: bold;
    border: 4px solid;
    border-top-color: rgba(255, 255, 255, 0.5);
    border-left-color: rgba(255, 255, 255, 0.5);
    box-shadow:
      inset 2px 2px 0 rgba(255, 255, 255, 0.25),
      inset -2px -2px 0 rgba(0, 0, 0, 0.25),
      3px 3px 0 rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  .quest-routine {
    background: linear-gradient(135deg, #70d070 0%, #40a040 50%, #308030 100%);
    border-color: #308030;
    border-bottom-color: #206020;
    border-right-color: #206020;
    color: #ffffff;
    text-shadow: 1px 1px 0 #206020;
  }

  .quest-deadline {
    background: linear-gradient(135deg, #f0d090 0%, #d8b070 50%, #c4a060 100%);
    border-color: #b89050;
    border-bottom-color: #987040;
    border-right-color: #987040;
    color: #5a3d2b;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.4);
  }

  .quest-normal {
    background: linear-gradient(135deg, #90c8f8 0%, #4080d0 50%, #3060a0 100%);
    border-color: #3060a0;
    border-bottom-color: #204080;
    border-right-color: #204080;
    color: #ffffff;
    text-shadow: 1px 1px 0 #204080;
  }

  .quest-info {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 1;
  }

  .quest-name {
    font-size: 15px;
    font-weight: bold;
    color: #3d2a18;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow:
      1px 1px 0 rgba(255, 255, 255, 0.6),
      -1px -1px 0 rgba(255, 255, 255, 0.2);
  }

  .quest-type {
    font-size: 11px;
    color: #5a4a3a;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.4);
  }

  .quest-badge {
    position: relative;
    padding: 5px 14px;
    background: linear-gradient(
      135deg,
      #f8e0a0 0%,
      #e8c880 25%,
      #d8b070 50%,
      #c4a060 100%
    );
    border: 4px solid #b89050;
    border-top-color: #f8e8b0;
    border-left-color: #f8e8b0;
    border-bottom-color: #906830;
    border-right-color: #906830;
    color: #4a3020;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.08em;
    text-shadow: 1px 1px 0 rgba(255, 255, 255, 0.5);
    box-shadow:
      inset 1px 1px 0 rgba(255, 255, 255, 0.3),
      inset -1px -1px 0 rgba(0, 0, 0, 0.1),
      3px 3px 0 rgba(0, 0, 0, 0.2);
    z-index: 1;
  }

  /* Mobile full-screen modal */
  @media (max-width: 640px) {
    .pixel-modal {
      padding: 0;
    }

    .modal-panel {
      max-width: none;
      max-height: none;
      width: 100%;
      height: 100%;
      border-radius: 0;
    }

    .modal-frame-svg {
      display: none;
    }

    .modal-header {
      margin: 0;
      border-bottom: 4px solid #4d3520;
    }

    .modal-body {
      margin: 0;
      padding: 16px;
      background: #c4956a;
    }

    .quest-item {
      min-height: 68px;
      padding: 14px 16px 14px 40px;
    }

    .quest-pin {
      width: 20px;
      height: 20px;
      top: 5px;
      left: 8px;
    }
  }
</style>
