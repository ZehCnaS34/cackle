import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript';


export default {
  input: "index.ts",
  output: {
    file: "dist/index.js",
    format: "cjs"
  },
  plugins: [
    resolve(),
    typescript(),
  ]
}
