import { defineConfig } from 'vite';

// Plugin that lets ALL existing HTML files work with Vite unchanged.
// 
// Problem: HTML files use <script src="../dist/mrmd.iife.js"></script>
//          followed by <script>const editor = mrmd.create(...);</script>
// 
// Solution: Intercept HTML responses and rewrite the script tags to use
//           ES module imports from source. Zero changes to HTML files.
function mrmdDevRedirect() {
  return {
    name: 'mrmd-dev-redirect',
    transformIndexHtml(html) {
      // Replace the IIFE script tag with a module import
      // And convert the inline script to a module too (so it waits for the import)
      return html
        .replace(
          /<script src="[^"]*dist\/mrmd\.iife\.js"><\/script>\s*<script>/,
          '<script type="module">import * as mrmd from "/src/index.js"; window.mrmd = mrmd;\n'
        );
    }
  };
}

export default defineConfig({
  plugins: [mrmdDevRedirect()],
  server: {
    port: 3333
  }
});
