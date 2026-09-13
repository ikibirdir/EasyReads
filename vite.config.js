import { defineConfig } from 'vite';

export default defineConfig({
    // Relative asset paths so the built `dist/` folder works from any URL path
    // (e.g. GitHub Pages at /EasyReads/) or any static file host.
    base: './',
});
