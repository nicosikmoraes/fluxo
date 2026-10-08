import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
 plugins:[vue({template:{transformAssetUrls:false}})],
 resolve:{preserveSymlinks:true},
 server:{port:5173,strictPort:true,proxy:{'/api':'http://127.0.0.1:8787','/storage':'http://127.0.0.1:8787'}},
 build:{outDir:'../app/public/ui',emptyOutDir:true,assetsDir:'assets'},
 base:'/ui/',
});
