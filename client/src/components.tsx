import type { HealthInfo } from "./api";

export function ProviderBadge({ health }: { health: HealthInfo | null }) {
  if (!health) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-600/60 bg-slate-800/60 px-3 py-1 text-xs text-slate-300">
        <span className="h-2 w-2 rounded-full bg-slate-500" />
        Checking provider
      </span>
    );
  }
  const live = health.provider === "nebius";
  return (
    <span
      title={
        live
          ? `Live Nemotron inference via Nebius Token Factory (${health.models.reasoning})`
          : "Demo mode: deterministic local provider, no API key configured"
      }
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        live
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400 pulse-soft"}`}
      />
      {live ? "Nemotron via Nebius Token Factory" : "Demo mode"}
    </span>
  );
}

export function Header({
  health,
  view,
  setView,
}: {
  health: HealthInfo | null;
  view: string;
  setView: (v: "agent" | "scan" | "match") => void;
}) {
  const tab = (id: "agent" | "scan" | "match", label: string) => (
    <button
      key={id}
      onClick={() => setView(id)}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
        view === id
          ? "bg-indigo-500/20 text-indigo-200 border border-indigo-400/40"
          : "text-slate-400 hover:text-slate-200 border border-transparent"
      }`}
    >
      {label}
    </button>
  );
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0a0e1a]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-lg font-black text-slate-950">
            H
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-slate-100">
              HireSense <span className="text-cyan-300">Nemotron</span>
            </div>
            <div className="text-[11px] text-slate-500">
              AI hiring copilot - screening agent
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          {tab("agent", "Agent Pipeline")}
          {tab("scan", "Resume Scan")}
          {tab("match", "Match")}
        </nav>
        <ProviderBadge health={health} />
      </div>
    </header>
  );
}

export function SectionCard({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="glass rounded-2xl p-5 shadow-xl shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
