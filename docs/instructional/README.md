# Instructional series: frontend interview prep with Coursewright

Twelve technical lessons of 20 to 22 minutes each, on the frontend of this repository. They prepare for a senior frontend product engineer interview at an AI-powered enterprise learning platform company. Each lesson:
- takes one area of the [study guide](../study-guide.md) and shows where it lives in the code;
- explains the trade-offs;
- drills the interview questions it prepares you for.

Every question from every lesson, with notes on what a strong answer includes, is also collected in one place: **[interview-questions.md](interview-questions.md)**.

Every lesson comes in three forms:

- an **audio lesson** (MP3), written to be understood without seeing any code, ending in a spoken interview drill;
- a **video** (MP4, 1080p, with captions): the same narration over a slide deck timed to it;
- a **video outline** (`README.md`) with the objectives, the questions, the files to show, a timed run sheet and demo commands.

## What's in each lesson folder

| File | What it is |
|---|---|
| `NN-topic.mp3` | The audio lesson. A narrator teaches; a second voice asks the interview questions in the drill. |
| `NN-topic.mp4` | The video: the narration, the slides and captions. |
| `script.md` | The transcript the audio is generated from. Read it, search it, or edit it and regenerate. |
| `slides.html` | The deck the video is built from. Open it in a browser and use the arrow keys to step through. |
| `README.md` | The video outline: objectives, interview questions with strong-answer notes, files to show, a timed run sheet, demo commands, traps and references. |

The code on screen is this repository's code, quoted as it is. Anything that isn't in the repo, such as what production would add, is labelled **Sketch**.

## Listening

- Every lesson has the same shape:
  - the questions it answers;
  - the concepts;
  - the Coursewright code;
  - trade-offs;
  - traps;
  - an **interview drill**;
  - a five-point recap.
- In the drill, each question is followed by a five-second pause. Pause the player if you need longer, answer out loud, then compare your answer with the model answer.
- The MP3s and MP4s are stored in **Git LFS**. After cloning, run `git lfs install` once and then `git lfs pull` to download them.

## The series

| # | Lesson | Audio and video | Study guide | Core interview question |
|---|---|---|---|---|
| 01 | [Layers, boundaries and the design system](01-layers-boundaries-and-design-system/) | [MP3](01-layers-boundaries-and-design-system/01-layers-boundaries-and-design-system.mp3) · [Video](01-layers-boundaries-and-design-system/01-layers-boundaries-and-design-system.mp4) · [Transcript](01-layers-boundaries-and-design-system/script.md) | §1 | How do you structure a large Angular app so it stays maintainable? |
| 02 | [Signals and zoneless change detection](02-signals-and-zoneless-change-detection/) | [MP3](02-signals-and-zoneless-change-detection/02-signals-and-zoneless-change-detection.mp3) · [Video](02-signals-and-zoneless-change-detection/02-signals-and-zoneless-change-detection.mp4) · [Transcript](02-signals-and-zoneless-change-detection/script.md) | §2, §5 | How do signals change change detection in a zoneless app? |
| 03 | [RxJS races and idempotent submits](03-rxjs-races-and-idempotent-submits/) | [MP3](03-rxjs-races-and-idempotent-submits/03-rxjs-races-and-idempotent-submits.mp3) · [Video](03-rxjs-races-and-idempotent-submits/03-rxjs-races-and-idempotent-submits.mp4) · [Transcript](03-rxjs-races-and-idempotent-submits/script.md) | §2 | `switchMap` or `exhaustMap` for a Save button? |
| 04 | [Routing, guards and deep links](04-routing-guards-and-deep-links/) | [MP3](04-routing-guards-and-deep-links/04-routing-guards-and-deep-links.mp3) · [Video](04-routing-guards-and-deep-links/04-routing-guards-and-deep-links.mp4) · [Transcript](04-routing-guards-and-deep-links/script.md) | §3 | `canMatch`, `canActivate` or a resolver? |
| 05 | [Accessibility in a single-page app](05-accessibility-in-a-single-page-app/) | [MP3](05-accessibility-in-a-single-page-app/05-accessibility-in-a-single-page-app.mp3) · [Video](05-accessibility-in-a-single-page-app/05-accessibility-in-a-single-page-app.mp4) · [Transcript](05-accessibility-in-a-single-page-app/script.md) | §4 | A screen-reader user says "nothing happens" after clicking a link. What's wrong? |
| 06 | [Performance budgets and web vitals](06-performance-budgets-and-web-vitals/) | [MP3](06-performance-budgets-and-web-vitals/06-performance-budgets-and-web-vitals.mp3) · [Video](06-performance-budgets-and-web-vitals/06-performance-budgets-and-web-vitals.mp4) · [Transcript](06-performance-budgets-and-web-vitals/script.md) | §5 | INP is poor on the catalog page. How do you find the cause? |
| 07 | [Contract-first REST from the frontend](07-contract-first-rest-from-the-frontend/) | [MP3](07-contract-first-rest-from-the-frontend/07-contract-first-rest-from-the-frontend.mp3) · [Video](07-contract-first-rest-from-the-frontend/07-contract-first-rest-from-the-frontend.mp4) · [Transcript](07-contract-first-rest-from-the-frontend/script.md) | §6 | How do you rename an API field with zero downtime? |
| 08 | [Browser auth: tokens and refresh](08-browser-auth-tokens-and-refresh/) | [MP3](08-browser-auth-tokens-and-refresh/08-browser-auth-tokens-and-refresh.mp3) · [Video](08-browser-auth-tokens-and-refresh/08-browser-auth-tokens-and-refresh.mp4) · [Transcript](08-browser-auth-tokens-and-refresh/script.md) | §7 | Where do you store tokens in a SPA, and why not `localStorage`? |
| 09 | [Async jobs, SSE and polling](09-async-jobs-sse-and-polling/) | [MP3](09-async-jobs-sse-and-polling/09-async-jobs-sse-and-polling.mp3) · [Video](09-async-jobs-sse-and-polling/09-async-jobs-sse-and-polling.mp4) · [Transcript](09-async-jobs-sse-and-polling/script.md) | §8 | Design bulk-enrolling 5,000 learners from a CSV, end to end. |
| 10 | [Testing: unit, integration and E2E](10-testing-unit-integration-and-e2e/) | [MP3](10-testing-unit-integration-and-e2e/10-testing-unit-integration-and-e2e.mp3) · [Video](10-testing-unit-integration-and-e2e/10-testing-unit-integration-and-e2e.mp4) · [Transcript](10-testing-unit-integration-and-e2e/script.md) | §9 | How do you test a race condition deterministically? |
| 11 | [CI/CD and frontend observability](11-ci-cd-and-frontend-observability/) | [MP3](11-ci-cd-and-frontend-observability/11-ci-cd-and-frontend-observability.mp3) · [Video](11-ci-cd-and-frontend-observability/11-ci-cd-and-frontend-observability.mp4) · [Transcript](11-ci-cd-and-frontend-observability/script.md) | §10, §11 | How do you connect a frontend error to the backend request that caused it? |
| 12 | [Evolving a large frontend](12-evolving-a-large-frontend/) | [MP3](12-evolving-a-large-frontend/12-evolving-a-large-frontend.mp3) · [Video](12-evolving-a-large-frontend/12-evolving-a-large-frontend.mp4) · [Transcript](12-evolving-a-large-frontend/script.md) | §12, §13 | Tell me about a multi-sprint frontend initiative you led. |

## Suggested orders

- **Full series:** 01 to 12 in order. Each lesson assumes the ones before it.
- **With the study guide's five sessions:**
  - session 1: 01–03;
  - session 2: 04–06;
  - session 3: 07–09;
  - session 4: 10–11;
  - session 5: 12, then re-answer every drill without notes.
- **Interview in a few days:** 03, 08, 05, 06, 09, then 12. These cover:
  - the race-condition answer;
  - token storage;
  - SPA accessibility;
  - a performance investigation;
  - the async design question;
  - the leadership story.
- **Just before the interview:** read [interview-questions.md](interview-questions.md) top to bottom, and answer each question out loud in under two minutes.

## Regenerating the audio

The MP3s are generated from each `script.md` by `tools/instructional-audio/generate.cs`. It's a .NET 10 file-based app that calls Azure AI Speech neural text to speech. The narrator is `en-US-AndrewMultilingualNeural` and the interviewer is `en-US-AvaMultilingualNeural`.

The media tools need the .NET 10 SDK. They're outside the pnpm workspace and CI, and are only needed to regenerate media.

```bash
# Validate scripts and estimate length and cost. No network, no key needed.
dotnet run tools/instructional-audio/generate.cs -- --dry-run

# Synthesize one or more lessons (folder-name filters), or everything with no filter.
export AZURE_SPEECH_KEY=$(az cognitiveservices account keys list -n <speech-resource> -g <resource-group> --query key1 -o tsv)
export AZURE_SPEECH_REGION=eastus2
dotnet run tools/instructional-audio/generate.cs -- 04 05

# Hear how every term in the pronunciation lexicon is spoken.
dotnet run tools/instructional-audio/generate.cs -- --pronunciation-test
```

- **Script format:**
  - `# NN · Title` first, then `## Section` headings (one synthesis request each).
  - Plain paragraphs are read by the narrator; `**Interviewer:**` paragraphs use the second voice.
  - `[pause 5s]` inserts silence.
  - Inline code is spoken through the lexicon.
  - Tables, fenced code blocks, links and HTML are rejected, because they can't be read aloud.
- **Pronunciation:** `tools/instructional-audio/pronunciations.json` maps acronyms, file names and code to how they're spoken. For example, `switchMap` becomes "switch map", `PKCE` becomes "pixie", and `aria-describedby` becomes "aria described by".
- **Cache:** audio is cached per section in `tools/instructional-audio/.cache/` (gitignored), so editing one section of a script only re-synthesizes that section.
- **Cost:** the whole series is roughly 220,000 characters, about $3.30 at $15 per million characters (as of September 2026). The dry run prints the estimate.

## Building a video

A lesson video is the lesson's narration MP3 with a slide deck timed to it. `tools/instructional-video/build.cs`:
1. screenshots each `<section>` of the lesson's `slides.html` with headless Edge or Chrome;
2. shows each slide from the moment the narration reaches that slide's `data-cue` phrase (a phrase from `script.md`);
3. adds captions generated from the script;
4. encodes a 1080p MP4 with ffmpeg.

```bash
# The audio generator must have run for the lesson first: it writes the timing manifest the video is synced to.
dotnet run tools/instructional-audio/generate.cs -- 01

# ffmpeg needs libx264 (FFMPEG_PATH if it isn't on PATH). EDGE_PATH overrides the browser.
export FFMPEG_PATH=/path/to/ffmpeg
dotnet run tools/instructional-video/build.cs -- 01 02 03

# While editing a deck: validate cues and print the schedule, or also render the PNGs to review, without encoding.
dotnet run tools/instructional-video/build.cs -- 05 --check
dotnet run tools/instructional-video/build.cs -- 05 --slides-only
```

- **Shared look:** every deck links `assets/slides.css` and `assets/slides.js`. The script builds the header and progress bar from the `<body>` attributes, colours code blocks, and supports progressive builds from a `<template>` (`data-show`, `data-highlight`).
- **Adding a video:** write `slides.html` for the lesson, using any existing deck as the template. Give every slide except the first a `data-cue` taken verbatim from `script.md`, in narration order. The builder reports any cue it can't find.
- **Memory:** screenshots run four browsers at once, and only one build renders at a time on a machine. Set `RENDER_WORKERS=2` on a machine short of memory.
- **Timing accuracy:** section boundaries are exact. Slide changes within a section are estimated from word counts, so they land within a second or two of the cue.

## Before re-recording

- **Check time-sensitive facts.** The facts in these lessons are as of September 2026. Several can change between Angular releases, so check them for your version:
  - the defaults the code relies on: zoneless, OnPush, the fetch-backed `HttpClient`;
  - the stability of `httpResource`, `linkedSignal` and the resource APIs;
  - WCAG and web-vitals thresholds.
- **Keep the code and the slides in step.** Code excerpts are quoted from the repo. After changing a quoted file, update the slide and the README excerpt, then rebuild that lesson.
- **Start from a clean environment:** `pnpm install`, then `pnpm dev`, and sign in as `learner.acme` or `manager.acme` (password `Coursewright2026!`).
