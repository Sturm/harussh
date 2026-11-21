<script setup lang="ts">
import { iconPaths, type IconName } from '../icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 })
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- static markup from icons.ts, never user input -->
  <svg
    class="icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="iconPaths[props.name]"
  />
</template>
