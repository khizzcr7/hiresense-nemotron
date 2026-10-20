// HireSense Nemotron - autonomous candidate screening agent.
// A real multi-step pipeline, run in code (not a chat wrapper):
//   1. parse      - extract a structured profile from the resume (fast model)
//   2. research   - Tavily live research on company + role (skipped honestly w/o key)
//   3. score      - reasoning model scores candidate with research as context
//   4. critique   - reasoning model red-teams the score (bias + evidence checks)
//   5. verdict    - final verdict + ranked strengths/gaps
//   6. interview  - 6-8 tailored interview questions + what good answers look like
//
// Emits structured events {step, status, summary, data, provider} via the
// supplied onEvent callback; the route layer turns them into SSE or plain JSON.

const llm = require("../llm");

const SAMPLE_RESEARCH = {
  provider: "demo",
  companyName: "FinEdge Technologies",
  industry: "fintech",
  headquarters: "Karachi, Pakistan",
  profile:
    "FinEdge Technologies is a fictional fintech company used for demo purposes. It builds payment and ledger tooling for regional banks and operates a hybrid Karachi office with remote-first engineering teams.",
  roleContext:
    "The Senior Frontend Engineer (React) role owns customer-facing dashboard features, works in TypeScript across a React/Next.js stack, and partners with a small platform team on CI/CD and observability.",
  recentNews: [
    {
      title: "FinEdge launches real-time settlement dashboard (sample)",
      url: "https://example.com/finedge-settlement-dashboard",
      snippet: "Sample news item for demo mode. Connect a Tavily API key for live research.",
    },
  ],
  sources: [
    { title: "FinEdge company overview (sample)", url: "https://example.com/finedge-overview" },
    { title: "Senior Frontend Engineer role page (sample)", url: "https://example.com/finedge-careers" },
  ],
};

function extractCompanyAndRole(jobText) {
  const companyMatch = jobText.match(/(?:at|@|company[:\s])\s*([A-Z][A-Za-z0-9&.\- ]{2,40})/);
  const roleMatch = jobText.match(/^(.{3,80})(?:\n|$)/);
  return {
    company: companyMatch ? companyMatch[1].trim() : "",
    role: roleMatch ? roleMatch[1].trim() : "Software Engineer",
  };
}

async function tavilyResearch({ jobText }) {
  const apiKey = process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY.trim();
  if (!apiKey) {
    return {
      status: "skipped",
      reason: "TAVILY_API_KEY not set. Research step skipped honestly; no data was fabricated.",
      provider: llm.providerMode(),
      data: null,
    };
  }
  const { company, role } = extractCompanyAndRole(jobText);
  const query = `${company} ${role}`.trim() || "software engineer hiring";
  try {
    const searchRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: 5,
        include_answer: true,
      }),
    });
    if (!searchRes.ok) throw new Error(`Tavily search HTTP ${searchRes.status}`);
    const search = await searchRes.json();
    const topUrl = (search.results && search.results[0] && search.results[0].url) || null;
    let extracted = null;
    if (topUrl) {
      const extractRes = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          urls: [topUrl],
          query,
          chunks_per_source: 3,
        }),
      });
      if (extractRes.ok) {
        const ext = await extractRes.json();
        extracted = (ext.results && ext.results[0] && ext.results[0].raw_content) || null;
      }
    }
    return {
      status: "done",
      reason: null,
      provider: "nebius",
      data: {
        provider: "nebius",
        companyName: company || "Unknown company",
        industry: "inferred from live results",
        query,
        answer: search.answer || null,
        results: (search.results || []).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: (r.content || "").slice(0, 300),
        })),
        extractedContent: extracted ? extracted.slice(0, 2000) : null,
        sources: (search.results || []).map((r) => ({ title: r.title, url: r.url })),
      },
    };
  } catch (e) {
    return {
      status: "error",
      reason: `Tavily research failed: ${e.message}. Continuing without live research.`,
      provider: "nebius",
      data: null,
    };
  }
}

async function stepParse({ resumeText, candidateName }, emit) {
  await emit("parse", "running", "Extracting structured candidate profile (fast model).");
  if (!llm.hasNebiusKey) {
    const profile = llm.loggedCall("parse", llm.MODELS.fast, llm.demoParseProfile(resumeText));
    if (candidateName) profile.name = candidateName;
    await emit("parse", "done", `Parsed profile for ${profile.name}.`, profile);
    return profile;
  }
  const res = await llm.chat({
    model: llm.MODELS.fast,
    purpose: "parse",
    json: true,
    messages: [
      { role: "system", content: "Extract a structured candidate profile from the resume. Return JSON only." },
      {
        role: "user",
        content:
          "Extract JSON with keys: name, currentTitle, yearsOfExperience (number), skills (array of strings), education (string), summary (one sentence).\n\nResume:\n" +
          resumeText.slice(0, 12000),
      },
    ],
  });
  const profile = JSON.parse(res.content);
  if (candidateName) profile.name = candidateName;
  profile.provider = res.provider;
  await emit("parse", "done", `Parsed profile for ${profile.name}.`, profile);
  return profile;
}

async function stepResearch({ jobText }, emit) {
  await emit("research", "running", "Gathering company and role context.");
  if (!llm.hasNebiusKey) {
    await emit(
      "research",
      "done",
      "Demo mode: using built-in sample research bundle (clearly marked sample).",
      SAMPLE_RESEARCH
    );
    return SAMPLE_RESEARCH;
  }
  const out = await tavilyResearch({ jobText });
  await emit(
    "research",
    out.status === "done" ? "done" : out.status,
    out.status === "done"
      ? `Live research complete: ${out.data.results.length} sources.`
      : out.reason,
    out.data || { reason: out.reason, provider: out.provider }
  );
  return out.data;
}

function researchBlock(research) {
  if (!research) return "No company research available.";
  const r = research;
  const news = (r.recentNews || r.results || [])
    .slice(0, 3)
    .map((n) => `- ${n.title}: ${(n.snippet || "").slice(0, 200)}`)
    .join("\n");
  return `Company: ${r.companyName || "unknown"}\nProfile: ${r.profile || r.answer || "n/a"}\nRole context: ${r.roleContext || "n/a"}\nRecent items:\n${news || "n/a"}`;
}

async function stepScore({ jobText, profile, research }, emit) {
  await emit("score", "running", "Scoring candidate vs job with research as context (reasoning model).");
  if (!llm.hasNebiusKey) {
    const scored = llm.loggedCall("score", llm.MODELS.reasoning, llm.demoScore({ jobText, profile, research }));
    await emit("score", "done", `Score: ${scored.score}/100.`, scored);
    return scored;
  }
  const res = await llm.chat({
    model: llm.MODELS.reasoning,
    purpose: "score",
    json: true,
    messages: [
      {
        role: "system",
        content:
          "You are a strict, evidence-driven technical hiring manager. Score the candidate 0-100 against the job. Return JSON only.",
      },
      {
        role: "user",
        content:
          "Score this candidate against the job posting. Consider the company research below as extra context.\n\n" +
          "JOB:\n" + jobText.slice(0, 8000) + "\n\n" +
          "CANDIDATE PROFILE (JSON):\n" + JSON.stringify(profile) + "\n\n" +
          "COMPANY RESEARCH:\n" + researchBlock(research) + "\n\n" +
          'Return JSON: {score (0-100 integer), rationale (string, cite concrete evidence), matchedSkills (array), missingSkills (array)}.',
      },
    ],
  });
  const scored = JSON.parse(res.content);
  scored.provider = res.provider;
  await emit("score", "done", `Score: ${scored.score}/100.`, scored);
  return scored;
}

async function stepCritique({ jobText, profile, scored }, emit) {
  await emit("critique", "running", "Red-teaming the score: bias check and evidence check (reasoning model).");
  if (!llm.hasNebiusKey) {
    const crit = llm.loggedCall(
      "critique",
      llm.MODELS.reasoning,
      llm.demoCritique({ score: scored.score, rationale: scored.rationale })
    );
    await emit("critique", "done", `Critique complete. Adjusted score: ${crit.adjustedScore}/100.`, crit);
    return crit;
  }
  const res = await llm.chat({
    model: llm.MODELS.reasoning,
    purpose: "critique",
    json: true,
    messages: [
      {
        role: "system",
        content:
          "You are a skeptical hiring auditor. Red-team the score below: check for bias (age, gender, location, name proxies), check every claim against textual evidence, and flag optimism bias. Return JSON only.",
      },
      {
        role: "user",
        content:
          "Audit this screening score.\n\nJOB (excerpt):\n" + jobText.slice(0, 4000) +
          "\n\nCANDIDATE (JSON):\n" + JSON.stringify(profile) +
          "\n\nPROPOSED SCORE + RATIONALE (JSON):\n" + JSON.stringify(scored) +
          '\n\nReturn JSON: {originalScore, adjustedScore (0-100), verdict ("strong fit"|"fit"|"weak fit"), findings (array of strings), adjustmentReason (string)}.',
      },
    ],
  });
  const crit = JSON.parse(res.content);
  crit.provider = res.provider;
  await emit("critique", "done", `Critique complete. Adjusted score: ${crit.adjustedScore}/100.`, crit);
  return crit;
}

async function stepVerdict({ profile, scored, crit }, emit) {
  await emit("verdict", "running", "Composing final verdict with ranked strengths and gaps.");
  const finalScore = crit.adjustedScore ?? scored.score;
  const verdict =
    crit.verdict ||
    (finalScore >= 75 ? "strong fit" : finalScore >= 55 ? "fit" : "weak fit");
  const strengths = (scored.matchedSkills || []).slice(0, 5).map((s) => ({
    skill: s,
    evidence: `Listed in resume; matched against job requirements.`,
  }));
  const gaps = (scored.missingSkills || []).slice(0, 5).map((s) => ({
    gap: s,
    recommendation: `Probe in interview; consider ramp-up plan.`,
  }));
  const out = {
    provider: llm.providerMode(),
    verdict,
    finalScore,
    strengths,
    gaps,
    headline: `${profile.name || "Candidate"}: ${verdict} (${finalScore}/100)`,
  };
  await emit("verdict", "done", `Verdict: ${out.headline}.`, out);
  return out;
}

async function stepInterview({ jobText, profile, research, scored }, emit) {
  await emit("interview", "running", "Generating tailored interview questions (reasoning model).");
  if (!llm.hasNebiusKey) {
    const iq = llm.loggedCall(
      "interview",
      llm.MODELS.reasoning,
      llm.demoInterviewQuestions({ profile, jobText, research })
    );
    await emit("interview", "done", `${iq.questions.length} interview questions generated.`, iq);
    return iq;
  }
  const res = await llm.chat({
    model: llm.MODELS.reasoning,
    purpose: "interview",
    json: true,
    messages: [
      {
        role: "system",
        content:
          "You are an expert interviewer. Write tailored interview questions grounded in the resume, job, and company research. Return JSON only.",
      },
      {
        role: "user",
        content:
          "Generate 6-8 interview questions tailored to this candidate and job. Each must include what a good answer looks like.\n\n" +
          "JOB:\n" + jobText.slice(0, 8000) + "\n\n" +
          "CANDIDATE (JSON):\n" + JSON.stringify(profile) + "\n\n" +
          "COMPANY RESEARCH:\n" + researchBlock(research) + "\n\n" +
          'Return JSON: {questions: [{n, question, goodAnswer}]}.',
      },
    ],
  });
  const iq = JSON.parse(res.content);
  iq.provider = res.provider;
  await emit("interview", "done", `${iq.questions.length} interview questions generated.`, iq);
  return iq;
}

async function runScreening({ jobText, resumeText, candidateName }, onEvent) {
  const emit = async (step, status, summary, data) => {
    const event = { step, status, summary, data: data ?? null, provider: llm.providerMode() };
    await onEvent(event);
    return event;
  };
  const profile = await stepParse({ resumeText, candidateName }, emit);
  const research = await stepResearch({ jobText }, emit);
  const scored = await stepScore({ jobText, profile, research }, emit);
  const crit = await stepCritique({ jobText, profile, scored }, emit);
  const verdict = await stepVerdict({ profile, scored, crit }, emit);
  const interview = await stepInterview({ jobText, profile, research, scored }, emit);
  return { profile, research, scored, critique: crit, verdict, interview };
}

module.exports = { runScreening, SAMPLE_RESEARCH };
