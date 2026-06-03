# TOEIC Static Quiz

This version has no Express API and no Qwen/Ollama semantic checking.

The browser loads `vocab-data.js`, creates questions locally, checks answers locally, and stores progress in `localStorage`.

## Run locally

You can directly open `src/index.html`, or use a static server:

```bash
npm install
npm run preview
```

## Build for GitHub Pages

```bash
npm run build
```

Then publish the `dist/` folder.
