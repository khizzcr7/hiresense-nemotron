// Shared API client and types for HireSense Nemotron.

const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export interface HealthInfo {
  status: string;
  provider: "nebius" | "demo";
  models: { reasoning: string; fast: string };
  baseUrl: string;
  tavilyConfigured: boolean;
}

export interface AgentEvent {
  step: string;
  status: "running" | "done" | "skipped" | "error";
  summary: string;
  data: Record<string, unknown> | null;
  provider: "nebius" | "demo";
}

export interface ScreenResult {
  provider: "nebius" | "demo";
  verdict: {
    provider: string;
    verdict: string;
    finalScore: number;
    strengths: { skill: string; evidence: string }[];
    gaps: { gap: string; recommendation: string }[];
    headline: string;
  };
  score: {
    score: number;
    rating: number;
    matchedSkills: string[];
    missingSkills: string[];
    rationale: string;
    provider: string;
  };
  profile: Record<string, unknown>;
  research: Record<string, unknown> | null;
  critique: Record<string, unknown>;
  interview: {
    provider: string;
    questions: { n: number; question: string; goodAnswer: string }[];
  };
  events: AgentEvent[];
}

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function analyzeResume(
  file: File,
  jobTitle: string,
  jobDesc: string
): Promise<{ feedback: string; provider: string }> {
  const form = new FormData();
  form.append("resume", file);
  form.append("jobTitle", jobTitle);
  form.append("jobDesc", jobDesc);
  const res = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Resume scan failed");
  return res.json();
}

export async function matchCandidate(payload: {
  jobTitle: string;
  jobDesc: string;
  resumeText: string;
}): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Match scoring failed");
  return res.json();
}

// Streams SSE events from the agent endpoint via a POST fetch.
export async function streamScreen(
  payload: { jobText: string; resumeText: string; candidateName: string },
  onEvent: (e: AgentEvent) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agent/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error("Agent pipeline request failed");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    try {
      onEvent(JSON.parse(trimmed.slice(5).trim()) as AgentEvent);
    } catch {
      // ignore malformed frames
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      for (const line of part.split("\n")) handleLine(line);
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) handleLine(line);
  }
}

export async function screenJson(payload: {
  jobText: string;
  resumeText: string;
  candidateName: string;
}): Promise<ScreenResult> {
  const res = await fetch(`${API_BASE}/api/agent/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Agent pipeline request failed");
  return res.json();
}
