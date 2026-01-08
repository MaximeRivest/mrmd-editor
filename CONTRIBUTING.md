# Contributing to mrmd-editor

## Project Structure

```
mrmd-editor/
├── src/                    # Source code
├── dist/                   # Built bundles (generated)
├── examples/               # Interactive demos
│   ├── index.html         # Examples listing
│   ├── document.html      # Clean document editor
│   └── executable.html    # Executable markdown with code cells
├── tests/                  # Feature tests
│   ├── index.html         # Auto-discovers test files
│   ├── api.html           # API tests
│   ├── basic.html         # Basic editor tests
│   └── ...                # Other feature tests
├── index.html              # Landing page
└── package.json
```

## Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Build the bundle

```bash
npm run build        # Single build
npm run dev          # Watch mode (rebuilds on changes)
```

### 3. Start the dev server

```bash
npm run serve
```

Then open http://localhost:3000

## Testing HTML Files

### Using the dev server (recommended)

```bash
npm run serve
```

- http://localhost:3000 - Landing page
- http://localhost:3000/examples/ - Interactive demos
- http://localhost:3000/tests/ - Feature tests (auto-discovers test files)

### Using file:// protocol

You can also open HTML files directly in a browser, but some features may not work:
- `tests/index.html` auto-discovery requires HTTP (uses `fetch()`)
- Some CORS-restricted features won't work

## Adding New Examples

1. Create a new HTML file in `examples/`
2. Reference the bundle with `<script src="../dist/mrmd.iife.js"></script>`
3. Add a link in `examples/index.html`

## Adding New Tests

1. Create a new HTML file in `tests/` (e.g., `my-feature.html`)
2. Reference the bundle with `<script src="../dist/mrmd.iife.js"></script>`
3. The test will be auto-discovered by `tests/index.html` if the filename matches common patterns

To add custom test names to auto-discovery, edit the `candidates` array in `tests/index.html`.

## Related Packages

### mrmd-js (JavaScript runtime)

For testing mrmd-js separately:

```bash
cd ../mrmd-js
node test-app/server.js
```

Then open http://localhost:3000 for the mrmd-js test playground.

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run build` | Build all bundles (CJS, ESM, IIFE) |
| `npm run dev` | Watch mode - rebuild on changes |
| `npm run serve` | Start static file server |
| `npm run test:node` | Quick Node.js import test |
