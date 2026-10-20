<script setup>
import { computed } from "vue";
import { arrowHead, isPath, pathData, textLines } from "./whiteboard";
import { displayColor } from "./whiteboardTheme";
const props = defineProps({ element: { type: Object, required: true }, editing: Boolean });
const lines = computed(() => textLines(props.element));
const padding = computed(() => props.element.type === "note" ? 20 : 8);
</script>

<template>
  <g :transform="`translate(${element.x} ${element.y})`" :data-element-id="element.id" class="sketch-element">
    <g :stroke="displayColor(element.stroke)" :stroke-width="element.strokeWidth" :fill="displayColor(element.fill, 'fill')" stroke-linecap="round" stroke-linejoin="round">
      <rect v-if="element.type==='rectangle'" :width="element.width" :height="element.height" rx="10" />
      <ellipse v-else-if="element.type==='ellipse'" :cx="element.width/2" :cy="element.height/2" :rx="element.width/2" :ry="element.height/2" />
      <polygon v-else-if="element.type==='diamond'" :points="`${element.width/2},0 ${element.width},${element.height/2} ${element.width/2},${element.height} 0,${element.height/2}`" />
      <g v-else-if="element.type==='note'" stroke="none">
        <rect x="1" y="4" :width="element.width" :height="element.height" rx="3" fill="#454157" opacity=".07" />
        <rect :width="element.width" :height="element.height" rx="3" :fill="displayColor(element.fill==='transparent'?'#fff1b8':element.fill, 'fill')" />
        <path :d="`M${element.width-22},${element.height} L${element.width-22},${element.height-22} L${element.width},${element.height-22} Z`" fill="#454157" opacity=".07" />
      </g>
      <g v-else-if="isPath(element)" fill="none">
        <path :d="pathData(element)" />
        <polyline v-if="element.type==='arrow'" :points="arrowHead(element)" />
      </g>
    </g>
    <text v-if="!editing && element.text" :x="padding" :y="padding+element.fontSize" :fill="displayColor(element.stroke)" :font-size="element.fontSize" font-family="Inter, Segoe UI, sans-serif" style="white-space:pre" pointer-events="none">
      <tspan v-for="(line,index) in lines" :key="index" :x="padding" :dy="index ? element.fontSize*1.4 : 0">{{ line || ' ' }}</tspan>
    </text>
  </g>
</template>
