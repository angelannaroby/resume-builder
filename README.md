# Resume Application Workspace

A browser-based React + TypeScript workspace for managing job applications from one place: tailor a resume, review imported JSON changes, generate ATS-friendly PDFs, draft cover letters, save application notes, and browse an Excel-backed application tracker.

The project is intentionally client-side. Resume data and generated application files stay on the user's machine; there is no backend and no resume content is sent to an external service.

## Features

- **Resume editor** with structured experience, education, skills and additional information
- **Review-before-apply JSON import** with Accept, Reject, Undo, Restore and safe Accept All
- **ATS-oriented PDF generation** with embedded fonts, selectable text and deterministic layout
- **Cover-letter editor** with company-aware greeting, subject, bold markers and PDF export
- **Application workspace** for job description and notes
- **Excel tracker** (`Applications.xlsx`) with a read-only in-app table, search and refresh
- **File System Access API integration** for saving CVs, cover letters, notes and tracker data to a user-selected folder
- **Local draft persistence** so work survives page refreshes
- **Automated tests** for review logic, PDF extraction, application tracking and UI flows

## Tech stack

React 18, TypeScript, Vite, jsPDF, ExcelJS, Vitest, Testing Library and PDF.js.

## Architecture

The source is organised by responsibility rather than by file type:

```text
src/
├── app/
│   ├── App.tsx                 # application orchestration and workspace navigation
│   ├── main.tsx
│   └── styles.css
├── data/
│   ├── resumeSource.ts         # resolves private local resume or public template
│   └── resumeTemplate.ts       # public-safe sample data
├── domain/
│   └── resume.ts               # resume domain model
├── features/
│   ├── application-notes/      # JD and application notes
│   ├── application-tracker/    # Excel tracker read/write + tracker UI
│   ├── cover-letter/           # editor and PDF generation
│   └── resume/
│       ├── components/         # editor support UI
│       ├── pdf/                # ATS-safe resume PDF pipeline
│       ├── review/             # import diff/review engine
│       └── ResumeEditor.tsx
├── services/
│   ├── fileSystem.ts           # browser folder/file access
│   └── outputFiles.ts          # output filename conventions
└── shared/
    └── ui/                     # reusable form and editor primitives
```

The Excel workbook remains the application tracker's source of truth. The Applications workspace only reads and renders the workbook; it does not maintain a competing browser-side database.

## Local development

```bash
npm ci
npm run dev
```

The dev server uses `http://localhost:5173` with a strict port so remembered folder permissions stay associated with the same origin.

Chrome or Edge is recommended because direct folder saving uses the File System Access API.

## Private resume data

The public repository builds and runs with `src/data/resumeTemplate.ts`.

To use a real master resume locally, place your existing file in `src/data/` with a name beginning with `defaultResume`, for example:

```text
src/data/defaultResume.ts
```

It must export:

```ts
export const defaultResume = { /* Resume object */ };
```

If the file comes from an older version of this project, update its type import to the current domain module, for example:

```ts
import type { Resume, ResumeBullet as Bullet } from "@/domain/resume";
```

`src/data/resumeSource.ts` discovers that local file automatically. The repository `.gitignore` excludes `src/data/defaultResume*.ts`, so normal `git add .` commands do not stage the private resume now or in later commits.

Generated PDFs, Excel trackers, backup JSON files and application folders are ignored as well.

## Commands

```bash
npm run dev          # local development
npm run build        # TypeScript check + production build
npm test             # test suite
npm run test:watch   # watch mode
npm run preview      # preview production build
```

## Resume import review

Importing a JSON file never replaces the current resume immediately. Differences are converted into proposals and shown next to the affected field.

- **Accept** applies one proposal.
- **Reject** leaves the resume unchanged.
- **Undo** reverses an accepted proposal when the target is still identifiable.
- **Restore** returns a rejected proposal to pending.
- **Accept All** applies only pending proposals that are not blocked by safety checks.
- Locked identity, employment metadata, education and additional-information fields are reported but are not silently overwritten by a tailored JSON import.

## File outputs

After choosing a parent folder, the application creates subfolders only when needed:

```text
<selected-folder>/
├── Applications.xlsx
├── <OwnerName>_CV.pdf
├── <OwnerName>_CoverLetter.pdf
├── Save CVs/
├── Save CLs/
└── ApplicationInfo/
```

Company-specific archive filenames are generated from the company and resume owner rather than being hardcoded to one person.

## Testing focus

The test suite covers more than component rendering. It checks review-engine reversibility and locked fields, reads generated PDFs back through PDF.js to verify extractable text and layout constraints, and verifies Excel tracker parsing and file-saving failure paths.
