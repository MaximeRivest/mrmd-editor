import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

// The light document bundle: editor + markdown rendering + themes.
// No Yjs, no runtimes, no terminals, no tables, no AI, no collaboration.
export default {
  input: 'src/document-entry.js',
  output: [
    {
      file: 'dist/mrmd-document.iife.js',
      format: 'iife',
      name: 'mrmdDocument',
      sourcemap: false,
      exports: 'named'
    },
    {
      file: 'dist/mrmd-document.iife.min.js',
      format: 'iife',
      name: 'mrmdDocument',
      sourcemap: false,
      exports: 'named',
      plugins: [terser()]
    }
  ],
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs()
  ]
};
