import { createApp } from 'vue';
import AdminRoot from './AdminRoot.vue';
import './admin.css';
import './admin-theme.css';
import '../appearance/theme.css';
import { initializeTheme } from '../appearance/theme';
initializeTheme();
createApp(AdminRoot).mount('#app');
