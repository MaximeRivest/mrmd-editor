# @plutojl/lang-julia [![NPM version](https://img.shields.io/npm/v/@plutojl/lang-julia.svg)](https://www.npmjs.org/package/@plutojl/lang-julia)

This package implements [Julia](https://julialang.org) language support
for the [CodeMirror 6](https://codemirror.net) code editor.

Features:

- Syntax highlighting based on the [Lezer Julia parser](https://github.com/JuliaPluto/lezer-julia)
- Indentation
- Keyword completion (optional)

## Usage

```
import { julia } from "lang-julia";

let state = EditorState.create({
  ...
  extensions: [
    julia(),
    ...
  ]
});
```
