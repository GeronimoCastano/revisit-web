# Revisit

A small web app for listening to your own language-course audio. Point it at a course folder
and it sorts the files into levels, lessons and readings, remembers where you stopped in every
lesson, and shows the reading booklet line by line while you listen.

Everything stays in your browser: imported audio and booklets go into IndexedDB and your
progress into local storage. Nothing is uploaded, and there is no server beyond the static files.

## Features

- Lessons resume where you left off, a couple of seconds early so you don't lose the sentence.
- A lesson counts as finished near its end, and the next one can start by itself.
- Lock-screen and headphone controls (play, pause, ±10 s, previous, next, scrubbing).
- Playback speed, a driving mode with big buttons, streaks and listening time.
- Reading lessons: numbered lines rebuilt from the booklet PDF, stress marks (bold letters in
  the booklet) highlighted, and the English shown under each line when the booklet has it.
- Recordings that hold several reading lessons are split across the booklet automatically.
- Course guides (audio and PDFs next to the level folders) get their own section.
- Save your progress to a file and load it in another browser.

## Course folders

```
Italian/                    ← the language
  User's Guide.mp3          ← optional course-wide audio and PDFs
  Level 1/                  ← lesson audio
    Reading/                ← any folder with "read" in its name
      … Reading 01.mp3
      … Reading booklet.pdf
  Level 2/
```

Lesson numbers come from the file names (`Unit 05`, `U05`, `Lesson_05`, …).

On an iPhone, where Safari can't pick a folder, compress it first: in the Files app, touch and
hold the language folder, choose **Compress**, then pick the `.zip` in Revisit. The zip is read
one file at a time, so even a multi-gigabyte course doesn't have to fit in memory. Picking
loose files works too; Revisit places them using the language and level in their names
(`… Italian 3 - Unit 01.mp3`).

## Development

```sh
npm install
npm run dev
```

To try the app with courses already on your computer, without importing them into the browser,
create `.env.local` with the folder that holds them:

```
REVISIT_LIBRARY=/path/to/your/Languages
```

The dev server then shares that folder at `/local-library/`. It is never part of a build.

```sh
npm test              # unit tests
npm run check-booklets -- /path/to/your/Languages   # parse every booklet and print a summary
npm run build         # static site in dist/
```

## Deploying

`.github/workflows/pages.yml` builds and publishes `dist/` to GitHub Pages on every push to
`main`. In the repository settings, set Pages → Source to "GitHub Actions".

On iPhone, open the site in Safari and use Share → Add to Home Screen. The app then works
offline, and Safari keeps its stored courses instead of clearing them after a few weeks.
