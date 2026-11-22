<script setup lang="ts">
import { computed } from 'vue'
import { resolveHostIcon, type IconSource } from '../hostIcons'
import { state } from '../state'

const props = withDefaults(defineProps<{ host: IconSource; size?: number }>(), { size: 40 })
const icon = computed(() => resolveHostIcon(props.host, state.customIcons))
const glyph = computed(() =>
  Math.round(props.size * (icon.value.kind === 'preset' && icon.value.preset.kind === 'logo' ? 0.5 : 0.55))
)
</script>

<template>
  <span
    class="host-icon"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.35)}px`,
      background: icon.bg,
      color: icon.kind === 'image' ? undefined : icon.fg
    }"
  >
    <img v-if="icon.kind === 'image'" :src="icon.src" alt="" draggable="false" />
    <!-- eslint-disable vue/no-v-html -- static markup from hostIcons.ts, never user input -->
    <svg
      v-else-if="icon.kind === 'preset'"
      :width="glyph"
      :height="glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      v-bind="
        icon.preset.kind === 'logo'
          ? { fill: 'currentColor' }
          : {
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 2,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round'
            }
      "
      v-html="icon.preset.svg"
    />
    <template v-else>{{ icon.text }}</template>
  </span>
</template>
