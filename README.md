# HireSense Nemotron

AI hiring copilot with an **autonomous 6-step candidate screening agent**, powered by
NVIDIA Nemotron 3 models served through the **Nebius Token Factory**. Built by
Muhammad Khizar for the Nebius x NVIDIA Global AI Hackathon (track: Best Apps and Agents).

HireSense Nemotron derives from an earlier personal project (HireSense, a Gemini-powered
resume feedback tool). During the hackathon it was substantially rebuilt: the LLM layer
was ported to Nemotron on Nebius, and a brand-new agentic screening pipeline with live
company research was added. See "Significantly updated during the hackathon" below.

## What it does

- **Agent Pipeline (new):** paste a job description and a resume, and the agent runs a
  real 6-step pipeline: parse the resume, research the company live (Tavily), score the
  candidate against the job, red-team its own score for bias and evidence, deliver a
  final verdict, and generate tailored interview questions with model answers.
  Progress streams live to the UI over Server-Sent Events.
- **Resume Scan:** upload a resume PDF plus a job title/description and get structured,
  actionable feedback in Markdown.
- **Match:** score a candidate against a job (0-100, 1-5 rating) with matched and
  missing skills.

Every LLM response carries a `provider` tag: `"nebius"` for live Nemotron inference,
`"demo"` for the deterministic local stand-in. The UI badges this honestly in the
header, so demo output is never passed off as model output.

## Architecture

```
+------------------+        +---------------------------+
|  Vite + React    |        |  Node / Express server    |
|  + TS + Tailwind |        +---------------------------+
|                  |        |  /api/health              |
|  - Agent Pipeline|  HTTP  |  /api/analyze  (PDF scan)  |
|    view (SSE)    +------->|  /api/match    (scoring)  |
|  - Resume Scan   |        |  /api/agent/screen        |
|  - Match view    |        |    - JSON mode            |
+------------------+        |    - SSE stream mode      |
                            +-------------+-------------+
                                          |
                    +---------------------+---------------------+
                    |                                           |
            +-------v-------+                          +--------v--------+
            |  LLM provider |                          |  Tavily search  |
            |  layer        |                          |  + extract APIs |
            |               |                          |  (live company  |
            |  nebius:      |                          |   research)     |
            |  OpenAI-style |                          +--------+--------+
            |  chat via     |
            |  Token Factory|
            |               |
            |  demo:        |
            |  deterministic|
            |  local logic  |
            +---------------+
```

## Nebius Token Factory + Nemotron integration

The server uses the `openai` npm package pointed at the Token Factory's
OpenAI-compatible endpoint:

- `NEBIUS_BASE_URL` (default `https://api.tokenfactory.nebius.com/v1/`)
- `NEBIUS_API_KEY` from env

Model routing is split by workload via env vars:

| Env var                  | Default                                   | Used for                                              |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------- |
| `NEMOTRON_REASONING_MODEL` | `nvidia/nemotron-3-super-120b-a12b`      | Match scoring, rationale, critique, interview prep    |
| `NEMOTRON_FAST_MODEL`      | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`  | Resume parsing and fast extraction                    |

The track guidance recommends Ultra-class models for heavy reasoning and
Nano/Super-class models for fast calls. Nemotron 3 Ultra (e.g.
`nvidia/Nemotron-3-Ultra-550b-a55b`) can be set as `NEMOTRON_REASONING_MODEL`
once its model ID is confirmed in the Token Factory playground.

## Tavily agent enrichment

Step 2 of the agent pipeline calls the Tavily REST API
(`https://api.tavily.com/search`, then `https://api.tavily.com/extract`) with
the company name and role extracted from the job text, gathering a company
profile, role context, and recent news. Sources are shown in the UI with links.

- `TAVILY_API_KEY` set: live research, results carry `provider: "nebius"`.
- Not set: the step returns status `"skipped"` with a clear reason. Nothing is
  fabricated; the UI shows the skip honestly.
- Demo mode (no Nebius key): a small built-in sample research bundle is used,
  clearly marked as sample data.

## Setup and run

Prerequisites: Node.js 18+.

```bash
# server
cd server
npm install
cp ../.env.example .env   # fill in keys, or skip for demo mode
npm start                 # http://localhost:5000 (npm run dev for watch mode)

# client (new terminal)
cd client
npm install
npm run dev               # http://localhost:5173 (proxies /api to the server)
```

With no env vars set, the server boots in demo mode and every endpoint works
end to end. With `NEBIUS_API_KEY` set, all LLM calls go to Nemotron via the
Token Factory; with `TAVILY_API_KEY` set, the agent does live company research.

For video capture, open the client with `?autodemo=1` (e.g.
`http://localhost:5173/?autodemo=1`): it pre-fills the seed job and resume and
auto-runs the pipeline on load.

Production client build: `cd client && npm run build` outputs `dist/`.
Set `VITE_API_URL` at build time to point the client at a deployed API.

## API endpoints

| Method | Path                | Description                                              |
| ------ | ------------------- | -------------------------------------------------------- |
| GET    | /api/health         | Provider status, model IDs, Tavily configured true/false |
| GET    | /api/test           | Quick LLM ping (demo text in demo mode)                  |
| POST   | /api/analyze         | Multipart resume PDF + jobTitle + jobDesc, returns Markdown feedback |
| POST   | /api/match          | JSON {jobTitle, jobDesc, resumeText}, returns score/rating/skills |
| POST   | /api/agent/screen   | JSON {jobText, resumeText, candidateName}; `stream=true` for SSE, otherwise JSON |

Every response includes a `provider` field (`"nebius"` or `"demo"`).

## Deployment notes

Deployment config is handled by the release coordinator. Notes for that step:

- `client/` builds with `npm run build` into `dist/`.
- `server/` starts with `npm start` (reads `PORT` from env).
- Required env on the server host: `NEBIUS_API_KEY`; optional: `TAVILY_API_KEY`,
  `NEMOTRON_REASONING_MODEL`, `NEMOTRON_FAST_MODEL`, `NEBIUS_BASE_URL`.
- For a static-hosted client, build with `VITE_API_URL` set to the API origin.

## Significantly updated during the hackathon (Oct 2026)

Per Devpost rules, this project derives from an existing repository (the
original Gemini-based HireSense). The following were built or changed during
the hackathon, October 2026:

(a) **LLM layer ported Gemini to Nemotron on Nebius Token Factory.** The
    `@google/genai` dependency and all Gemini calls were replaced with the
    `openai` npm package pointed at the Token Factory base URL, with model
    routing split between a reasoning model (scoring, critique, interview
    prep) and a fast model (resume parsing). All prompts were ported and
    adapted from the Gemini originals.

(b) **Brand-new autonomous 6-step agent pipeline.** `server/agent/` is entirely
    new: a coded multi-step screening agent (parse, research, score, critique,
    verdict, interview prep) with structured per-step events, SSE streaming,
    and full LLM-call logging. It is the centerpiece of this entry.

(c) **New Tavily live-research enrichment.** The agent's research step calls
    Tavily search and extract APIs to ground scoring in real company and role
    context, with honest skipped/sample states when keys are absent.

(d) **New agent UI.** The client was rebuilt in Vite + React + TypeScript +
    Tailwind with a new Agent Pipeline view: live step timeline, score dial,
    rationale, matched/missing skills, company research cards with source
    URLs, verdict, and interview-prep accordion, plus a provider badge and an
    `?autodemo=1` mode for video capture.

## Seed data

`server/seed/` contains one fictional job posting (Senior Frontend Engineer at
FinEdge Technologies, Karachi/remote) and two fictional candidate resumes (one
strong fit, one weak fit). All names and companies are fictional.

## License

MIT. Copyright (c) 2026 Muhammad Khizar.
