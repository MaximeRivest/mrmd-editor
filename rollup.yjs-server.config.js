import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

// Yjs for a Node host (aiconvo's collaboration server): the CRDT, the
// y-websocket wire protocol pieces (sync, awareness) and lib0's encoders,
// as one CommonJS file with no dependencies.
export default {
  input: 'src/yjs-server-entry.js',
  output: { file: 'dist/yjs-server.cjs', format: 'cjs', exports: 'named', sourcemap: false },
  plugins: [resolve({ browser: false, preferBuiltins: true, exportConditions: ['node'] }), commonjs()],
};
