# Revisit

A small web app for listening to your own audio lessons. Pick a ZIP file to get started.
Revisit remembers playback positions and can display accompanying PDF readings.

Imported files and progress stay in your browser. Nothing is uploaded.

## Features

- Resume playback where you stopped.
- Playback speed, headphone and lock-screen controls.
- Optional automatic playback of the next recording.
- PDF viewing and reading text alongside audio.
- Save and restore progress using a backup file.

## Use

Open Revisit and choose **Pick a ZIP file**.

## Development

```sh
npm install
npm run dev
npm test
npm run build
```

The production build is written to `dist/`. The GitHub Pages workflow publishes it
when changes are pushed to `main`.
