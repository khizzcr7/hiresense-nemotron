// HireSense Nemotron - LLM provider layer.
// One interface, two backends:
//   - "nebius": OpenAI-compatible chat completions against Nebius Token Factory,
//     served with NVIDIA Nemotron 3 models.
//   - "demo": deterministic local stand-in so the server runs end to end with
//     zero keys configured. Every response carries a provider tag ("nebius" or
//     "demo") so the client can badge results honestly. Providers are never mixed
//     silently.

const MODELS = {
  reasoning:
    process.env.NEMOTRON_REASONING_MODEL ||
    "nvidia/nemotron-3-super-120b-a12b",
  fast:
    process.env.NEMOTRON_FAST_MODEL ||
    "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
};

const NEBIUS_BASE_URL =
  process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/";

const hasNebiusKey = Boolean(
  process.env.NEBIUS_API_KEY && process.env.NEBIUS_API_KEY.trim()
);

let openaiClient = null;
if (hasNebiusKey) {
  // Lazy require keeps demo mode dependency-free of the openai package path.
  const OpenAI = require("openai");
  openaiClient = new OpenAI({
    baseURL: NEBIUS_BASE_URL,
    apiKey: process.env.NEBIUS_API_KEY,
  });
}

function mode() {
  return hasNebiusKey ? "nebius" : "demo";
}

// ---------------------------------------------------------------------------
// Deterministic demo implementations (no network, no keys).
// ---------------------------------------------------------------------------

function pickSkillList(text, pool) {
  const lower = text.toLowerCase();
  return pool.filter((s) => lower.includes(s.toLowerCase()));
}

const DEMO_SKILL_POOL = [
  "React",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Express",
  "Next.js",
  "Redux",
  "Tailwind CSS",
  "HTML",
  "CSS",
  "REST APIs",
  "GraphQL",
  "PostgreSQL",
  "MongoDB",
  "Docker",
  "Git",
  "CI/CD",
  "Testing",
  "Python",
  "Django",
];

function demoParseProfile(resumeText) {
  const skills = pickSkillList(resumeText, DEMO_SKILL_POOL);
  const nameMatch = resumeText.match(/^(?:name[:\s]*)?([A-Z][a-z]+ [A-Z][a-z]+)/m);
  const yearsMatch = resumeText.match(/(\d+)\+?\s*years?/i);
  const titleMatch = resumeText.match(/(Senior|Junior|Mid|Lead)\s+[A-Za-z ]*Engineer/i);
  return {
    name: nameMatch ? nameMatch[1] : "Candidate",
    currentTitle: titleMatch ? titleMatch[0] : "Software Engineer",
    yearsOfExperience: yearsMatch ? Number(yearsMatch[1]) : 2,
    skills,
    education: "BS Software Engineering (fictional demo profile)",
    summary:
      "Demo profile parsed locally. Connect a Nebius API key for real Nemotron extraction.",
    provider: "demo",
  };
}

function demoScore({ jobText, profile, research }) {
  const jobSkills = pickSkillList(jobText, DEMO_SKILL_POOL);
  const resumeSkills = profile.skills || [];
  const lower = resumeSkills.map((s) => s.toLowerCase());
  const matched = jobSkills.filter((s) => lower.includes(s.toLowerCase()));
  const missing = jobSkills.filter((s) => !lower.includes(s.toLowerCase()));
  const yearsReq = (jobText.match(/(\d+)\+?\s*years?/i) || [0, 3])[1];
  const yearsHave = profile.yearsOfExperience || 2;
  let score = 60 + matched.length * 4 - missing.length * 3;
  if (yearsHave >= Number(yearsReq)) score += 8;
  else score -= 10;
  score = Math.max(30, Math.min(95, score));
  const companyNote = research && research.companyName
    ? ` The research notes describe ${research.companyName} as a ${research.industry || "technology"} company with a ${research.culture || "engineering-driven"} culture.`
    : "";
  return {
    score,
    rating: score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : 2,
    matchedSkills: matched,
    missingSkills: missing,
    rationale:
      `Matched ${matched.length} of ${jobSkills.length} required skills (${matched.join(", ") || "none"}). ` +
      `Experience: ${yearsHave} years vs roughly ${yearsReq} required. ` +
      `Key gaps: ${missing.join(", ") || "none"}.${companyNote}`,
    provider: "demo",
  };
}

function demoCritique({ score, rationale }) {
  const adjusted = Math.max(30, Math.min(95, score - 3));
  return {
    originalScore: score,
    adjustedScore: adjusted,
    verdict: adjusted >= 75 ? "strong fit" : adjusted >= 55 ? "fit" : "weak fit",
    findings: [
      "Bias check: score is based on listed skills and years; no proxies for age, gender, or location were used.",
      "Evidence check: matched skills are drawn verbatim from the resume text; no skill was inferred without textual support.",
      "Penalty check: missing skills are weighted against the candidate, but learning-adjacent skills (e.g. React vs Next.js) still count.",
    ],
    adjustmentReason: `Reduced score by 3 points to correct for optimism bias in skill matching (${score} -> ${adjusted}).`,
    provider: "demo",
  };
}

function demoInterviewQuestions({ profile, jobText, research }) {
  const skills = (profile.skills || []).slice(0, 4);
  const company = research && research.companyName ? research.companyName : "the company";
  const q = (n, question, goodAnswer) => ({ n, question, goodAnswer });
  return {
    provider: "demo",
    questions: [
      q(1, `Walk me through a recent ${skills[0] || "frontend"} project and the hardest trade-off you made.`, "Look for concrete ownership, measured outcomes, and a principled reason behind the trade-off, not just buzzwords."),
      q(2, `How would you structure a large React codebase to stay maintainable over two years?`, "Expect folder-by-feature or module boundaries, state management strategy, testing discipline, and upgrade strategy."),
      q(3, `Describe a production bug you debugged end to end. What was your process?`, "A reproducible story: hypothesis, tooling used, root cause, fix, and prevention added."),
      q(4, `How do you keep performance good in a data-heavy dashboard?`, "Memoization, virtualization, code splitting, and measuring before optimizing."),
      q(5, `Why are you a good fit for ${company} specifically?`, "Evidence they read the company profile: product, stack, and how their skills map to it."),
      q(6, `Tell me about a time you disagreed with a design or product decision.`, "Disagrees respectfully, brings data, commits once decided."),
      q(7, `How do you handle an unclear requirement with a tight deadline?`, "Clarifies fast, timeboxes exploration, ships an increment, iterates."),
    ],
  };
}

function demoFeedback({ jobTitle, jobDesc, resumeText }) {
  const skills = pickSkillList(resumeText, DEMO_SKILL_POOL);
  return (
    `## Demo resume feedback for: ${jobTitle || "Role"}\n\n` +
    `> Demo mode: connect a Nebius API key for real Nemotron analysis.\n\n` +
    `### Executive summary\n` +
    `- Resume lists ${skills.length} recognizable technical skills: ${skills.join(", ") || "none detected"}.\n` +
    `- Job description provided: ${jobDesc ? "yes" : "no"}.\n` +
    `- Quick win: quantify impact (latency reduced, users served, revenue affected) for each role.\n\n` +
    `### Detailed feedback\n` +
    `- Lead each role with one outcome line before listing responsibilities.\n` +
    `- Mirror the job's key terms where honest: ATS filters and human screeners scan for them.\n` +
    `- Keep it to two pages; cut technologies not used in the last three years.\n\n` +
    `### Suggestions to match better\n` +
    `- Add a short "Relevant skills" section tuned to this posting.\n` +
    `- Link a live demo or repo for one flagship project.\n`
  );
}

// ---------------------------------------------------------------------------
// Unified chat call.
// ---------------------------------------------------------------------------

async function chat({ model, messages, purpose, json = false }) {
  const started = Date.now();
  if (!hasNebiusKey) {
    throw new Error("Demo mode should not call the network layer directly.");
  }
  const body = {
    model,
    messages,
    ...(json ? { response_format: { type: "json_object" } } : {}),
    temperature: json ? 0.2 : 0.4,
  };
  const completion = await openaiClient.chat.completions.create(body);
  const latencyMs = Date.now() - started;
  const usage = completion.usage || {};
  console.log(
    `[llm] purpose=${purpose} provider=nebius model=${model} ` +
      `latencyMs=${latencyMs} promptTokens=${usage.prompt_tokens ?? "?"} ` +
      `completionTokens=${usage.completion_tokens ?? "?"}`
  );
  return {
    content: completion.choices[0].message.content || "",
    model,
    provider: "nebius",
    tokens: {
      prompt: usage.prompt_tokens ?? null,
      completion: usage.completion_tokens ?? null,
    },
    latencyMs,
  };
}

function loggedCall(purpose, model, demoResult) {
  console.log(
    `[llm] purpose=${purpose} provider=demo model=${model} latencyMs=1 (deterministic local)`
  );
  return { ...demoResult, provider: "demo" };
}

module.exports = {
  MODELS,
  NEBIUS_BASE_URL,
  hasNebiusKey,
  providerMode: mode,
  chat,
  loggedCall,
  demoParseProfile,
  demoScore,
  demoCritique,
  demoInterviewQuestions,
  demoFeedback,
};
