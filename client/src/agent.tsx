import { useEffect, useRef, useState } from "react";
import type { AgentEvent, ScreenResult } from "./api";
import { streamScreen } from "./api";
import { SectionCard } from "./components";
import {
  SEED_JOB,
  SEED_NAME_STRONG,
  SEED_NAME_WEAK,
  SEED_RESUME_STRONG,
  SEED_RESUME_WEAK,
} from "./seed";

const STEPS = [
  { id: "parse", label: "Parse resume", desc: "Structured profile via the fast Nemotron model" },
  { id: "research", label: "Research company", desc: "Live Tavily research on company and role" },
  { id: "score", label: "Score candidate", desc: "Reasoning model scores with research as context" },
  { id: "critique", label: "Red-team critique", desc: "Bias check and evidence check on the score" },
  { id: "verdict", label: "Final verdict", desc: "Verdict with ranked strengths and gaps" },
  { id: "interview", label: "Interview prep", desc: "Tailored questions plus what good answers look like" },
];

const inputCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

function stepState(stepId: string, events: AgentEvent[]): "idle" | "running" | "done" | "skipped" | "error" {
  const evts = events.filter((e) => e.step === stepId);
  if (!evts.length) return "idle";
  const last = evts[evts.length - 1];
  return last.status === "done" ? "done" : last.status === "skipped" ? "skipped" : last.status === "error" ? "error" : "running";
}

function stepSummary(stepId: string, events: AgentEvent[]): string {
  const evts = events.filter((e) => e.step === stepId);
  if (!evts.length) return "";
  return evts[evts.length - 1].summary;
}

function StepTimeline({ events }: { events: AgentEvent[] }) {
  return (
    <ol className="space-y-1">
      {STEPS.map((s) => {
        const st = stepState(s.id, events);
        return (
          <li key={s.id} className="step-item relative">
            <div className="step-line relative flex items-start gap-3 rounded-xl px-2 py-2.5">
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm ${
                  st === "done"
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
                    : st === "running"
                      ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-200"
                      : st === "error"
                        ? "border-rose-400/60 bg-rose-500/15 text-rose-300"
                        : st === "skipped"
                          ? "border-amber-400/60 bg-amber-500/15 text-amber-300"
                          : "border-slate-600/60 bg-slate-800/60 text-slate-500"
                }`}
              >
                {st === "done" ? (
                  <span aria-label="done">&#10003;</span>
                ) : st === "running" ? (
                  <span className="spinner inline-block h-4 w-4 rounded-full border-2 border-indigo-300/40 border-t-indigo-200" aria-label="running" />
                ) : st === "error" ? (
                  <span aria-label="error">!</span>
                ) : st === "skipped" ? (
                  <span aria-label="skipped">-</span>
                ) : (
                  <span className="text-xs text-slate-500">{STEPS.indexOf(s) + 1}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{s.label}</span>
                  {st === "running" && <span className="pulse-soft text-[11px] text-indigo-300">working</span>}
                  {st === "skipped" && <span className="text-[11px] text-amber-300">skipped</span>}
                </div>
                <div className="text-xs text-slate-500">{s.desc}</div>
                {stepSummary(s.id, events) && (
                  <div className="mt-1 text-xs text-slate-400">{stepSummary(s.id, events)}</div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ScoreDial({ score, verdict }: { score: number; verdict: string }) {
  const color =
    score >= 75 ? "text-emerald-300 border-emerald-400/70" : score >= 55 ? "text-amber-300 border-amber-400/70" : "text-rose-300 border-rose-400/70";
  return (
    <div className="flex items-center gap-5">
      <div className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 bg-slate-900 text-4xl font-black ${color}`}>
        {score}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500">Final verdict</div>
        <div className="text-xl font-bold capitalize text-slate-100">{verdict}</div>
        <div className="mt-1 text-xs text-slate-500">Score out of 100, after red-team critique</div>
      </div>
    </div>
  );
}

function InterviewAccordion({ questions }: { questions: { n: number; question: string; goodAnswer: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-2">
      {questions.map((q) => (
        <div key={q.n} className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/60">
          <button
            onClick={() => setOpen(open === q.n ? null : q.n)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="text-sm font-medium text-slate-200">
              <span className="mr-2 text-indigo-300">Q{q.n}</span>
              {q.question}
            </span>
            <span className="text-slate-500">{open === q.n ? "-" : "+"}</span>
          </button>
          {open === q.n && (
            <div className="border-t border-slate-700/60 px-4 py-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                What a good answer looks like
              </div>
              <p className="text-sm text-slate-300">{q.goodAnswer}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function AgentPipeline({ autodemo }: { autodemo: boolean }) {
  const [jobText, setJobText] = useState(SEED_JOB);
  const [resumeText, setResumeText] = useState(SEED_RESUME_STRONG);
  const [candidateName, setCandidateName] = useState(SEED_NAME_STRONG);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [error, setError] = useState("");
  const autoRan = useRef(false);

  const run = async () => {
    setError("");
    setResult(null);
    setEvents([]);
    if (!jobText.trim() || !resumeText.trim()) {
      setError("Paste a job description and a resume first.");
      return;
    }
    setRunning(true);
    let latest: AgentEvent[] = [];
    try {
      await streamScreen(
        { jobText, resumeText, candidateName: candidateName.trim() || "Candidate" },
        (e) => {
          latest = [...latest, e];
          setEvents(latest);
          if (e.step === "result" && e.data) {
            setResult(e.data as unknown as ScreenResult);
          }
        }
      );
    } catch {
      setError("The pipeline request failed. Is the server running?");
      setRunning(false);
      return;
    }
    setRunning(false);
  };

  useEffect(() => {
    if (autodemo && !autoRan.current) {
      autoRan.current = true;
      const t = setTimeout(() => run(), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useStrong = () => {
    setResumeText(SEED_RESUME_STRONG);
    setCandidateName(SEED_NAME_STRONG);
  };
  const useWeak = () => {
    setResumeText(SEED_RESUME_WEAK);
    setCandidateName(SEED_NAME_WEAK);
  };

  const research = (result?.research ?? null) as Record<string, unknown> | null;
  const has = (v: unknown): boolean => Boolean(v);
  const str = (v: unknown): string => String(v ?? "");
  const sources = (research?.sources as { title: string; url: string }[] | undefined) ?? [];
  const news = (research?.recentNews as { title: string; url: string; snippet: string }[] | undefined)
    ?? (research?.results as { title: string; url: string; snippet: string }[] | undefined)
    ?? [];

  return (
    <div className="space-y-6">
      <SectionCard title="Screening inputs">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Job description
            </label>
            <textarea
              className={`${inputCls} font-mono text-xs`}
              rows={12}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400">
                Resume text or upload
              </label>
              <div className="flex gap-2">
                <button
                  onClick={useStrong}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
                >
                  Load strong-fit resume
                </button>
                <button
                  onClick={useWeak}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20"
                >
                  Load weak-fit resume
                </button>
              </div>
            </div>
            <textarea
              className={`${inputCls} font-mono text-xs`}
              rows={10}
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
            <input
              type="file"
              accept=".txt,.md"
              className="mt-2 w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-3 file:py-1.5 file:text-xs file:text-indigo-200"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setResumeText(await f.text());
              }}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Candidate name
            </label>
            <input
              className={inputCls}
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="Candidate name"
            />
          </div>
          <button
            onClick={run}
            disabled={running}
            className="glow-btn rounded-xl px-8 py-3.5 text-base font-bold text-slate-950"
          >
            {running ? (
              <span className="inline-flex items-center gap-2">
                <span className="spinner inline-block h-4 w-4 rounded-full border-2 border-slate-700/50 border-t-slate-900" />
                Agent running
              </span>
            ) : (
              "Run agent pipeline"
            )}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </SectionCard>

      {(events.length > 0 || result) && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SectionCard title="Live pipeline">
              <StepTimeline events={events} />
            </SectionCard>
          </div>
          <div className="space-y-6 lg:col-span-3">
            {result ? (
              <>
                <SectionCard title="Verdict and score">
                  <ScoreDial score={result.verdict.finalScore} verdict={result.verdict.verdict} />
                  <p className="mt-4 text-sm leading-relaxed text-slate-300">{result.score.rationale}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-emerald-500/10 p-3">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                        Matched skills
                      </div>
                      <ul className="list-disc pl-4 text-sm text-slate-300">
                        {result.score.matchedSkills.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl bg-rose-500/10 p-3">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-300">
                        Missing skills
                      </div>
                      <ul className="list-disc pl-4 text-sm text-slate-300">
                        {result.score.missingSkills.length ? (
                          result.score.missingSkills.map((s) => <li key={s}>{s}</li>)
                        ) : (
                          <li className="list-none text-slate-500">None flagged</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Company research"
                  aside={
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
                      {(result.research?.provider as string) === "nebius" ? "live via Tavily" : "sample data"}
                    </span>
                  }
                >
                  {research ? (
                    <div className="space-y-3 text-sm text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-100">
                          {String(research.companyName ?? "Company")}
                        </span>
                        {has(research.industry) && (
                          <span className="text-slate-500"> - {str(research.industry)}</span>
                        )}
                      </div>
                      {has(research.profile ?? research.answer) && (
                        <p>{str(research.profile ?? research.answer)}</p>
                      )}
                      {has(research.roleContext) && <p>{str(research.roleContext)}</p>}
                      {news.length > 0 && (
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Recent items
                          </div>
                          <ul className="space-y-1">
                            {news.slice(0, 3).map((n, i) => (
                              <li key={i}>
                                <a
                                  href={n.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-300 hover:text-indigo-200 hover:underline"
                                >
                                  {n.title}
                                </a>
                                {has(n.snippet) && <span className="text-slate-500"> - {str(n.snippet).slice(0, 120)}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {sources.length > 0 && (
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Sources
                          </div>
                          <ul className="space-y-1">
                            {sources.map((s, i) => (
                              <li key={i}>
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-300 hover:text-indigo-200 hover:underline"
                                >
                                  {s.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {has((research as Record<string, unknown>).reason) && (
                        <p className="text-xs text-amber-300/90">
                          {str((research as Record<string, unknown>).reason)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No research available.</p>
                  )}
                </SectionCard>

                <SectionCard title="Red-team critique">
                  <div className="space-y-2 text-sm text-slate-300">
                    <p>
                      Score adjusted from{" "}
                      <span className="font-semibold text-slate-100">
                        {String((result.critique as Record<string, unknown>).originalScore ?? "-")}
                      </span>{" "}
                      to{" "}
                      <span className="font-semibold text-slate-100">
                        {String((result.critique as Record<string, unknown>).adjustedScore ?? "-")}
                      </span>
                      .
                    </p>
                    <p className="text-slate-400">
                      {String((result.critique as Record<string, unknown>).adjustmentReason ?? "")}
                    </p>
                    <ul className="list-disc space-y-1 pl-5">
                      {((result.critique as Record<string, unknown>).findings as string[] | undefined)?.map(
                        (f, i) => (
                          <li key={i}>{f}</li>
                        )
                      )}
                    </ul>
                  </div>
                </SectionCard>

                <SectionCard title="Interview prep">
                  <InterviewAccordion questions={result.interview.questions} />
                </SectionCard>
              </>
            ) : (
              <SectionCard title="Results">
                <p className="text-sm text-slate-500">
                  The pipeline is running. Results will appear here when it completes.
                </p>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
