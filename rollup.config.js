import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [
    // IIFE for browsers - includes all named exports under window.mrmd
    {
      file: 'dist/mrmd.iife.js',
      format: 'iife',
      name: 'mrmd',
      sourcemap: true,
      exports: 'named'
    },
    {
      file: 'dist/mrmd.iife.min.js',
      format: 'iife',
      name: 'mrmd',
      sourcemap: true,
      exports: 'named',
      plugins: [terser()]
    },
    // CommonJS for Node
    {
      file: 'dist/mrmd.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    // ESM for bundlers
    {
      file: 'dist/mrmd.esm.js',
      format: 'es',
      sourcemap: true
    }
  ],
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs()
  ]
};
