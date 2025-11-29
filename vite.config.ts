import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // <-- важная строка, чтобы пути к JS/CSS были относительными
});
