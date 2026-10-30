import { createApp } from 'vue';
import '../../style.css';
import '../../features/appearance/theme.css';
import RoadmapDarkPrototype from './RoadmapDarkPrototype.vue';
import { installRoadmapDemo } from './roadmapDemo';

document.documentElement.dataset.theme = 'graphite';
installRoadmapDemo();
createApp(RoadmapDarkPrototype).mount('#app');
