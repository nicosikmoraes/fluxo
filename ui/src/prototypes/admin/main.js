import { createApp } from 'vue';
import AdminPrototype from './AdminPrototype.vue';
import '../../features/admin/admin.css';
import '../../features/admin/admin-theme.css';
import '../../features/appearance/theme.css';
import { initializeTheme } from '../../features/appearance/theme';
initializeTheme();
createApp(AdminPrototype).mount('#app');
