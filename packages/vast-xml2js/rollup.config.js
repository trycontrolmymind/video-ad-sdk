/* eslint-disable filenames/match-exported, sort-keys */
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import {uglify} from 'rollup-plugin-uglify';
import pkg from './package.json';

// eslint-disable-next-line no-process-env
const production = process.env.NODE_ENV === 'production';

const plugins = [
  babel({
    exclude: [
      '../../node_modules/**',
      'node_modules/**'
    ]
  }),
  resolve({
    customResolveOptions: {
      moduleDirectory: [
        'node_modules',
        '../../node_modules'
      ]
    }
  }),
  commonjs()
];

const config = [
  {
    input: 'src/index.browser.js',
    output: {
      name: pkg.name,
      file: pkg.browser,
      format: 'umd'
    },
    plugins: [
      ...plugins,
      production && uglify()
    ]
  },
  {
    input: 'src/index.browser.js',
    output: {
      file: pkg.module,
      format: 'es'
    },
    plugins
  },
  {
    input: 'src/index.js',
    output: {
      file: pkg.main,
      format: 'cjs'
    },
    plugins
  }
];

export default config;
