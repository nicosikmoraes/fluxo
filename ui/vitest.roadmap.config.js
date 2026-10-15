import { defineConfig, mergeConfig } from 'vitest/config';
import vite from './vite.config';
export default mergeConfig(vite, defineConfig({ test: {
 environment: 'happy-dom',
 include: ['tests/roadmap-activity-panel.test.js', 'tests/roadmap-card-types.test.js', 'tests/roadmap-connected-create.test.js', 'tests/roadmap-selection.test.js', 'tests/roadmap-multi-select.test.js', 'tests/roadmap-preferences.test.js', 'tests/roadmap-portals.test.js', 'tests/roadmap-alignment.test.js', 'tests/roadmap-alignment-controls.test.js'],
} }));
