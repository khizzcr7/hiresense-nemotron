import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { analyzeResume, matchCandidate } from "./api";
import { SectionCard } from "./components";

const inputCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

export function ResumeScan() {
  const [jobTitle, setJobTitle] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file || !jobTitle.trim()) {
      setError("Upload a resume PDF and enter a job title first.");
      return;
    }
    setLoading(true);
    try {
      const out = await analyzeResume(file, jobTitle, jobDesc);
      setFeedback(out.feedback);
      setProvider(out.provider);
    } catch {
      setError("Something went wrong while scanning the resume.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Resume scan">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Job title
            </label>
            <input
              className={inputCls}
              placeholder="e.g. Senior Frontend Engineer (React)"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Job description (optional)
            </label>
            <textarea
              className={inputCls}
              rows={5}
              placeholder="Paste the job description here"
              value={jobDesc}
              onChange={(e) => setJobDesc(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Resume file (PDF)
            </label>
            <input
              type="file"
              accept=".pdf"
              className="w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-200 hover:file:bg-indigo-500/30"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="glow-btn w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-950"
          >
            {loading ? "Scanning with Nemotron" : "Scan resume"}
          </button>
        </form>
      </SectionCard>
      <SectionCard
        title="Feedback"
        aside={
          provider ? (
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300">
              provider: {provider}
            </span>
          ) : undefined
        }
      >
        {feedback ? (
          <div className="markdown-body max-h-[520px] overflow-y-auto text-sm text-slate-300">
            <ReactMarkdown>{feedback}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Run a scan to see tailored feedback here.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

export function MatchView() {
  const [jobTitle, setJobTitle] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!jobTitle.trim() || !resumeText.trim()) {
      setError("Enter a job title and paste the resume text first.");
      return;
    }
    setLoading(true);
    try {
      const out = await matchCandidate({ jobTitle, jobDesc, resumeText });
      setResult(out);
    } catch {
      setError("Something went wrong while scoring the match.");
    } finally {
      setLoading(false);
    }
  };

  const score = typeof result?.score === "number" ? (result.score as number) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Candidate-job match">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Job title
            </label>
            <input
              className={inputCls}
              placeholder="e.g. Senior Frontend Engineer (React)"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Job description
            </label>
            <textarea
              className={inputCls}
              rows={4}
              placeholder="Paste the job description here"
              value={jobDesc}
              onChange={(e) => setJobDesc(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Resume text
            </label>
            <textarea
              className={inputCls}
              rows={8}
              placeholder="Paste the candidate resume text here"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="glow-btn w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-950"
          >
            {loading ? "Scoring match" : "Score match"}
          </button>
        </form>
      </SectionCard>
      <SectionCard title="Match result">
        {result ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-indigo-400/70 bg-slate-900 text-2xl font-bold text-indigo-200">
                {score}
              </div>
              <div>
                <div className="text-xs text-slate-500">Provider</div>
                <div className="text-sm font-medium text-slate-200">
                  {String(result.provider ?? "unknown")}
                </div>
                <div className="mt-1 text-xs text-slate-500">Rating</div>
                <div className="text-sm text-amber-300">
                  {"*".repeat(Number(result.rating ?? 0)) || "-"}
                </div>
              </div>
            </div>
            <p className="text-slate-300">{String(result.rationale ?? "")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                  Matched skills
                </div>
                <ul className="list-disc pl-4 text-slate-300">
                  {((result.matchedSkills as string[]) ?? []).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-rose-500/10 p-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-300">
                  Missing skills
                </div>
                <ul className="list-disc pl-4 text-slate-300">
                  {((result.missingSkills as string[]) ?? []).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Run a match to see the score here.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
