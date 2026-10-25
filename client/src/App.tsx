import { useEffect, useState } from "react";

type Health = { status: string; db: string; uptimeSec?: number };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("Cannot reach the API"));
  }, []);

  let message = "Checking backend...";
  if (error) message = `🔴 ${error}`;
  else if (health) {
    message =
      health.db === "up" ? "🟢 Backend and database are up" : "🟡 Backend up, database down";
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
      <div className="w-96 rounded-xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-xl font-semibold">API Monitor</h1>
        <p className="mt-4 text-sm">{message}</p>
      </div>
    </main>
  );
}
