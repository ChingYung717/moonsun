import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/examples')) {
            return 'vendor-three-addons';
          }
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          if (id.includes('node_modules/astronomy-engine')) {
            return 'vendor-astronomy';
          }
          if (id.includes('node_modules/lunar-javascript')) {
            return 'vendor-lunar';
          }
          if (id.includes('src/astro/eclipses/catalog.json')) {
            return 'data-catalog';
          }
          if (id.includes('src/astro/geo/chinaBoundary')) {
            return 'data-geo';
          }
          return undefined;
        },
      },
    },
  },
});
