import { useEffect, useState } from "react";
import "./index.css";
import type { HealthInfo } from "./api";
import { fetchHealth } from "./api";
import { Header } from "./components";
import { ResumeScan, MatchView } from "./views";
import { AgentPipeline } from "./agent";

type View = "agent" | "scan" | "match";

export default function App() {
  const [view, setView] = useState<View>("agent");
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [autodemo, setAutodemo] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autodemo") === "1") {
      setAutodemo(true);
      setView("agent");
    }
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <Header health={health} view={view} setView={setView} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {healthError && (
          <div className="mb-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Could not reach the API server. Start it with{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">
              npm start
            </code>{" "}
            inside the <code className="font-mono text-xs">server/</code> folder,
            then reload this page.
          </div>
        )}
        {view === "agent" && <AgentPipeline autodemo={autodemo} />}
        {view === "scan" && <ResumeScan />}
        {view === "match" && <MatchView />}
        <footer className="mt-12 border-t border-slate-800/80 pt-6 text-center text-xs text-slate-500">
          HireSense Nemotron - autonomous screening agent powered by NVIDIA
          Nemotron on Nebius Token Factory. Demo seed data is fictional.
        </footer>
      </main>
    </div>
  );
}
