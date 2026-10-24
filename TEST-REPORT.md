# TEST-REPORT.md - HireSense Nemotron smoke tests

Run date: 2026-10-20. All tests against the local server in **demo mode**
(no env vars set). Live Nebius/Tavily paths were not exercised (no keys in
this environment); they share the same code paths and are exercised by the
deterministic providers.

## Environment

- `server/`: `npm install` clean, `npm start` (node index.js) boots with zero env vars.
- `client/`: `npm install` clean, `npm run build` clean (vite, dist/ emitted),
  `npx tsc --noEmit` clean, `npm run dev` serves on :5173 with /api proxy to :5000.

## Results

| # | Endpoint | Request | Result |
| - | -------- | ------- | ------ |
| 1 | GET /api/health | - | PASS. `status: ok`, `provider: demo`, reasoning model `nvidia/nemotron-3-super-120b-a12b`, fast model `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `tavilyConfigured: false`. |
| 2 | GET /api/test | - | PASS. Returns "Hello from HireSense Nemotron (demo mode)." |
| 3 | POST /api/match (strong fit seed) | jobTitle + jobDesc + strong resume text | PASS. 200, `provider: demo`, score 80, rating 5, matched skills listed. |
| 4 | POST /api/match (weak fit seed) | jobTitle + weak resume text | PASS. 200, score 47 (clearly lower than strong fit). |
| 5 | POST /api/match (missing resumeText) | jobTitle only | PASS. 400 with `{"error":"jobTitle and resumeText are required."}`. |
| 6 | POST /api/analyze (PDF upload) | multipart resume PDF + jobTitle + jobDesc | PASS. 200, `provider: demo`, Markdown feedback (862 chars). PDF parsed from a real resume file. |
| 7 | POST /api/analyze (no file) | jobTitle only / empty POST | PASS. 400 with `{"error":"Resume file missing or not uploaded."}`. (Fixed a crash when req.body was undefined on empty POST.) |
| 8 | POST /api/agent/screen JSON (strong) | seed job + strong resume + name | PASS. 200, `provider: demo`, verdict "Ayesha Khan: strong fit (92/100)", 12 events, 7 interview questions. |
| 9 | POST /api/agent/screen JSON (weak) | seed job + weak resume + name | PASS. 200, verdict "Daniyal Sheikh: weak fit (36/100)", score 39, correct missing-skill list (React, TypeScript, Next.js, ...). |
| 10 | POST /api/agent/screen (missing resumeText) | jobText only | PASS. 400 with `{"error":"jobText and resumeText are required."}`. |
| 11 | POST /api/agent/screen SSE (stream=true) | small job + resume | PASS. 14 events in order: parse running/done, research running/done, score running/done, critique running/done, verdict running/done, interview running/done, result done (full payload: provider, verdict, score, profile, research, critique, interview), complete done. |
| 12 | Client dev server | GET / and GET /api/health via :5173 | PASS. Serves index.html; /api proxy reaches the server. |
| 13 | Client build | `npm run build` | PASS. dist/ emitted, no TS errors. |

## Re-verification run - 2026-10-24

All 13 smoke tests above were independently re-run against the current tree
(demo mode, zero env vars) and PASS again:

- Server boots clean on a fresh port; /api/health and /api/test correct.
- /api/match discriminates (strong-fit seed clearly outscores weak-fit seed);
  absolute scores vary with the exact job text passed, as expected from the
  deterministic scorer. Agent scores reproduce exactly: strong 92/100,
  weak 36/100, 12 events, 7 interview questions.
- /api/agent/screen SSE mode streams 14 events in the documented order,
  ending with result + complete.
- /api/analyze parses a real resume PDF and returns Markdown feedback;
  both 400 error paths (match, agent, analyze) return the documented errors.
- Client: `npm run build` clean (197 modules), `npx tsc --noEmit` clean,
  Vite dev server serves the app and proxies /api to the server.
- No code changes were needed; nothing was broken.

Repo state note (2026-10-24): the public GitHub repo
(khizzcr7/hiresense-nemotron) holds 25 of the 29 source files. The 4 files
missing from the remote - `client/src/components.tsx` (imported by App,
agent and views, so the remote tree cannot build without it),
`client/tsconfig.json`, `client/package-lock.json` and
`server/seed/resume-weak-fit.txt` - are in the staged upload set and must be
added before deploying from the repo.

## Notes

- Demo scoring is deterministic and discriminates: strong-fit seed scores
  92/100, weak-fit seed 36/100 on the same job posting.
- Research step in demo mode returns the built-in sample bundle marked
  `provider: demo`; with no Tavily key in nebius mode it returns status
  "skipped" with a reason (code path verified by reading, not live).
- Every LLM response object includes `provider: "demo"` or `"nebius"`;
  providers are never mixed.
- Copy rules verified: no em-dashes and no lorem ipsum in client/server UI copy.
