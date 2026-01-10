/**
 * Prettier Integration
 *
 * Provides code formatting using Prettier for supported languages.
 */

import * as prettier from 'prettier/standalone';
import prettierPluginBabel from 'prettier/plugins/babel';
import prettierPluginEstree from 'prettier/plugins/estree';
import prettierPluginHtml from 'prettier/plugins/html';
import prettierPluginCss from 'prettier/plugins/postcss';
import prettierPluginMarkdown from 'prettier/plugins/markdown';
import prettierPluginYaml from 'prettier/plugins/yaml';
import prettierPluginGraphql from 'prettier/plugins/graphql';
import prettierPluginTypeScript from 'prettier/plugins/typescript';

/**
 * Map of language identifiers to Prettier parser names.
 */
const LANGUAGE_TO_PARSER = {
  // JavaScript family
  javascript: 'babel',
  js: 'babel',
  jsx: 'babel',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'typescript',

  // Web
  html: 'html',
  htm: 'html',
  vue: 'vue',
  css: 'css',
  scss: 'scss',
  less: 'less',

  // Data formats
  json: 'json',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',

  // Markdown
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'mdx',

  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',
};

/**
 * All Prettier plugins needed for our supported languages.
 */
const PRETTIER_PLUGINS = [
  prettierPluginBabel,
  prettierPluginEstree,
  prettierPluginHtml,
  prettierPluginCss,
  prettierPluginMarkdown,
  prettierPluginYaml,
  prettierPluginGraphql,
  prettierPluginTypeScript,
];

/**
 * Check if Prettier supports a given language.
 *
 * @param {string} language - Language identifier
 * @returns {boolean}
 */
export function prettierSupports(language) {
  return language.toLowerCase() in LANGUAGE_TO_PARSER;
}

/**
 * Get the list of languages Prettier supports.
 *
 * @returns {string[]}
 */
export function prettierLanguages() {
  return Object.keys(LANGUAGE_TO_PARSER);
}

/**
 * Format code using Prettier.
 *
 * @param {string} code - Code to format
 * @param {string} language - Language identifier
 * @param {Object} [options] - Prettier options
 * @returns {Promise<{formatted: string, changed: boolean}>}
 */
export async function prettierFormat(code, language, options = {}) {
  const lang = language.toLowerCase();
  const parser = LANGUAGE_TO_PARSER[lang];

  if (!parser) {
    return { formatted: code, changed: false };
  }

  try {
    const formatted = await prettier.format(code, {
      parser,
      plugins: PRETTIER_PLUGINS,
      // Default options - can be overridden
      printWidth: 80,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      ...options,
    });

    return {
      formatted,
      changed: formatted !== code,
    };
  } catch (error) {
    console.warn('[prettier] Format failed:', error.message);
    return { formatted: code, changed: false };
  }
}
