// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';
// import fs from 'fs';
// import path from 'path';

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     https: {
//       // Reading the exact same certificates we created in the backend root
//       key: fs.readFileSync(path.resolve(__dirname, '../backend/cert.key')),
//       cert: fs.readFileSync(path.resolve(__dirname, '../backend/cert.crt')),
//     },
//     port: 5173, // Keep the same port
//     host: 'localhost'
//   }
// });


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Removed the HTTPS object and fs certificate reading to align with local HTTP development
    port: 5173, 
    host: 'localhost'
  }
});