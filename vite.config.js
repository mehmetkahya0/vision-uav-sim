import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  // GitHub Pages için base path (repository adınızı buraya yazın)
  base: './',
  
  plugins: [cesium()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'esnext',
    sourcemap: false,         // Production'da sourcemap kapalı (daha küçük bundle)
    outDir: 'dist',
    // ═══ CHUNK SIZE OPTİMİZASYONU ═══
    // Cesium çok büyük bir kütüphane (~40MB), chunk'ları büyük tut
    // Küçük chunk = çok fazla HTTP request = loading glitch
    chunkSizeWarningLimit: 5000,   // 5MB'a kadar uyarı yok
    rollupOptions: {
      output: {
        // Manuel chunk splitting: Cesium'u tek büyük chunk'ta tut
        manualChunks: {
          cesium: ['cesium'],
        },
        // Chunk dosya adları
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Minify: terser ile daha agresif sıkıştırma
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,    // Console.log'ları tut (debug için)
        passes: 2,              // 2 pass sıkıştırma
      },
    },
  },
  optimizeDeps: {
    include: ['cesium'],
    // Esbuild: Cesium'u daha hızlı pre-bundle et
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
