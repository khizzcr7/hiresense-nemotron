// HireSense Nemotron server.
// Ported from the original HireSense (Gemini) server. The LLM layer now runs
// NVIDIA Nemotron 3 models through the Nebius Token Factory, with a
// deterministic local demo mode when NEBIUS_API_KEY is not set.

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const pdfParse = require("pdf-parse");
const llm = require("./llm");
const { runScreening } = require("./agent/screeningAgent");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({ storage: multer.memoryStorage() });

function providerInfo() {
  return {
    provider: llm.providerMode(),
    models: llm.MODELS,
    baseUrl: llm.NEBIUS_BASE_URL,
    tavilyConfigured: Boolean(
      process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY.trim()
    ),
  };
}

// ---------------------------------------------------------------------------
// Health / capability report.
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ...providerInfo() });
});

// Legacy test endpoint (ported): quick LLM ping.
app.get("/api/test", async (req, res) => {
  try {
    if (!llm.hasNebiusKey) {
      llm.loggedCall("test", llm.MODELS.fast, {});
      return res.send("Hello from HireSense Nemotron (demo mode).");
    }
    const r = await llm.chat({
      model: llm.MODELS.fast,
      purpose: "test",
      messages: [{ role: "user", content: "Say hi in one short sentence." }],
    });
    res.send(r.content);
  } catch (e) {
    console.error("[test] failed:", e.message);
    res.status(500).send("Test failed: " + e.message);
  }
});

// ---------------------------------------------------------------------------
// POST /api/analyze  (ported from the original Gemini server)
// multipart: resume PDF + jobTitle + jobDesc -> Markdown feedback.
// ---------------------------------------------------------------------------
app.post("/api/analyze", upload.single("resume"), async (req, res) => {
  try {
    const { jobTitle, jobDesc } = req.body || {};
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "Resume file missing or not uploaded." });
    }
    console.log("[analyze] uploaded resume:", req.file.originalname);
    const parsed = await pdfParse(req.file.buffer);
    const resumeText = parsed.text;

    if (!llm.hasNebiusKey) {
      const feedback = llm.demoFeedback({ jobTitle, jobDesc, resumeText });
      llm.loggedCall("analyze", llm.MODELS.reasoning, {});
      return res.json({ feedback, provider: "demo" });
    }

    const prompt =
      "You are an expert tech recruiter. Give the following:\n\n" +
      "1. A 3-bullet executive summary of the resume match\n" +
      "2. Detailed, bullet-pointed resume feedback\n" +
      "3. Suggestions to better match this role:\n\n" +
      `Job Title: "${jobTitle || ""}"\n` +
      `Job Description: ${jobDesc || "N/A"}\n` +
      `Resume Content:\n${resumeText.slice(0, 12000)}\n\n` +
      "Return results in Markdown format.";

    const r = await llm.chat({
      model: llm.MODELS.reasoning,
      purpose: "analyze",
      messages: [{ role: "user", content: prompt }],
    });
    res.json({ feedback: r.content, provider: r.provider });
  } catch (error) {
    console.error("[analyze] failed:", error.message);
    res.status(500).json({ error: "AI processing failed." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/match  (candidate-job match + rating, JSON in / JSON out)
// ---------------------------------------------------------------------------
app.post("/api/match", async (req, res) => {
  try {
    const { jobTitle, jobDesc, resumeText } = req.body || {};
    if (!jobTitle || !resumeText) {
      return res
        .status(400)
        .json({ error: "jobTitle and resumeText are required." });
    }
    const jobText = `Job Title: ${jobTitle}\nJob Description:\n${jobDesc || "N/A"}`;

    if (!llm.hasNebiusKey) {
      const profile = llm.demoParseProfile(resumeText);
      const scored = llm.demoScore({ jobText, profile, research: null });
      llm.loggedCall("match", llm.MODELS.reasoning, {});
      return res.json({ ...scored, profile });
    }

    const r = await llm.chat({
      model: llm.MODELS.reasoning,
      purpose: "match",
      json: true,
      messages: [
        {
          role: "system",
          content:
            "You are a strict, evidence-driven technical hiring manager. Score 0-100. Return JSON only.",
        },
        {
          role: "user",
          content:
            "Score this candidate against the job.\n\nJOB:\n" +
            jobText.slice(0, 8000) +
            "\n\nRESUME:\n" +
            resumeText.slice(0, 12000) +
            '\n\nReturn JSON: {score (0-100 integer), rating (1-5 integer), rationale (string), matchedSkills (array), missingSkills (array)}.',
        },
      ],
    });
    const out = JSON.parse(r.content);
    out.provider = r.provider;
    res.json(out);
  } catch (error) {
    console.error("[match] failed:", error.message);
    res.status(500).json({ error: "AI processing failed." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/agent/screen  (autonomous screening agent)
// Body: { jobText, resumeText, candidateName, stream? }
// stream=true -> Server-Sent Events of per-step events; otherwise plain JSON.
// ---------------------------------------------------------------------------
app.post("/api/agent/screen", async (req, res) => {
  const { jobText, resumeText, candidateName } = req.body || {};
  if (!jobText || !resumeText) {
    return res
      .status(400)
      .json({ error: "jobText and resumeText are required." });
  }
  const stream = req.body.stream === true || req.query.stream === "true";
  console.log(
    `[agent] screen started name=${candidateName || "n/a"} stream=${stream} provider=${llm.providerMode()}`
  );

  try {
    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const send = (event) =>
        new Promise((resolve) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`, () => resolve());
        });
      const result = await runScreening({ jobText, resumeText, candidateName }, send);
      const payload = {
        provider: llm.providerMode(),
        verdict: result.verdict,
        score: result.scored,
        profile: result.profile,
        research: result.research,
        critique: result.critique,
        interview: result.interview,
      };
      await send({ step: "result", status: "done", summary: "Result ready.", data: payload, provider: llm.providerMode() });
      await send({ step: "complete", status: "done", summary: "Pipeline complete.", data: null, provider: llm.providerMode() });
      console.log("[agent] screen complete (SSE)");
      return res.end();
    }
    const events = [];
    const result = await runScreening({ jobText, resumeText, candidateName }, async (e) => {
      events.push(e);
    });
    console.log("[agent] screen complete (JSON)");
    res.json({
      provider: llm.providerMode(),
      verdict: result.verdict,
      score: result.scored,
      profile: result.profile,
      research: result.research,
      critique: result.critique,
      interview: result.interview,
      events,
    });
  } catch (error) {
    console.error("[agent] screen failed:", error.message);
    if (stream && !res.headersSent) {
      // headers already sent in stream mode; emit an error event instead
    }
    if (stream) {
      res.write(
        `data: ${JSON.stringify({ step: "error", status: "error", summary: error.message, data: null, provider: llm.providerMode() })}\n\n`
      );
      return res.end();
    }
    res.status(500).json({ error: "Agent screening failed: " + error.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HireSense Nemotron server running on http://localhost:${PORT}`);
    console.log(`Provider mode: ${llm.providerMode()}`);
    console.log(`Reasoning model: ${llm.MODELS.reasoning}`);
    console.log(`Fast model: ${llm.MODELS.fast}`);
  });
}

module.exports = app;
