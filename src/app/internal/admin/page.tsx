"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAdminApiBasePath,
  getAdminDashboardUrlForBrowser,
} from "@/lib/admin/client";

interface AdminStats {
  generatedAt: string;
  rooms: {
    total: number;
    active: number;
    waiting: number;
    playing: number;
    finished: number;
    connectedPlayers: number;
    modeBreakdown: Array<{ mode: string; count: number }>;
    targetSizeBreakdown: Array<{ targetSize: number; count: number }>;
    recent: Array<{
      roomCode: string;
      status: string;
      mode: string;
      targetSize: number;
      currentRound: number;
      playerCount: number;
      connectedCount: number;
      createdAt: string;
      expiresAt: string;
    }>;
  };
  rounds: {
    total: number;
    revealed: number;
  };
  activity: {
    totalEvents: number;
    today: number;
    thisWeek: number;
    activeIps24h: number;
    uniquePlayersToday: number;
    gamesStartedToday: number;
    gamesStartedWeek: number;
    gamesCompletedToday: number;
    gamesCompletedWeek: number;
    byTypeToday: Array<{ type: string; count: number }>;
    byTypeWeek: Array<{ type: string; count: number }>;
    topIps24h: Array<{ ip: string; events: number; lastSeen: string }>;
    recent: Array<{
      type: string;
      ip: string;
      route: string;
      roomCode: string | null;
      createdAt: string;
    }>;
  };
  storage: {
    rooms: number;
    rounds: number;
    activityEvents: number;
  };
}

type CleanupAction =
  | "purge_activity"
  | "delete_finished_rooms"
  | "delete_stale_rooms"
  | "delete_all_rounds"
  | "purge_all_game_data";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="interrogation-card space-y-1">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="font-mono text-3xl font-bold text-truth">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [activityRetentionDays, setActivityRetentionDays] = useState(7);
  const [dashboardUrl, setDashboardUrl] = useState("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getAdminApiBasePath()}/stats`);
      if (!response.ok) {
        throw new Error("Failed to load stats.");
      }

      const json = await response.json();
      setStats(json.stats);
      setEmail(json.admin?.email ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    setDashboardUrl(getAdminDashboardUrlForBrowser());
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  async function handleLogout() {
    await fetch(`${getAdminApiBasePath()}/auth/logout`, { method: "POST" });
    router.replace("./login");
    router.refresh();
  }

  async function handleCleanup(action: CleanupAction) {
    const labels: Record<CleanupAction, string> = {
      purge_activity: `delete activity logs older than ${activityRetentionDays} days`,
      delete_finished_rooms: "delete all finished rooms and their rounds",
      delete_stale_rooms: "delete expired rooms",
      delete_all_rounds: "delete all round documents",
      purge_all_game_data: "delete ALL rooms, rounds, and activity logs",
    };

    if (!window.confirm(`This will ${labels[action]}. Continue?`)) {
      return;
    }

    setCleanupLoading(true);
    setCleanupMessage(null);

    try {
      const response = await fetch(`${getAdminApiBasePath()}/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          olderThanDays: activityRetentionDays,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Cleanup failed.");
      }

      setCleanupMessage(`Cleanup complete: ${JSON.stringify(json.result)}`);
      await loadStats();
    } catch (err) {
      setCleanupMessage(
        err instanceof Error ? err.message : "Cleanup failed."
      );
    } finally {
      setCleanupLoading(false);
    }
  }

  if (loading && !stats) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-muted">Loading dashboard…</p>
      </main>
    );
  }

  if (error || !stats) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-lie">{error || "Unable to load dashboard."}</p>
          <button
            onClick={loadStats}
            className="rounded-lg border border-border px-4 py-2 text-sm text-warm"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">
              Operations dashboard
            </p>
            <h1 className="font-serif text-3xl font-bold text-warm">
              Two Truths telemetry
            </h1>
            <p className="text-sm text-muted">
              Signed in as <span className="text-warm">{email}</span>
              {" · "}
              Updated {new Date(stats.generatedAt).toLocaleString()}
            </p>
            {dashboardUrl && (
              <p className="text-xs text-muted">
                Dashboard URL:{" "}
                <span className="font-mono text-warm">{dashboardUrl}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadStats}
              className="rounded-lg border border-border px-4 py-2 text-sm text-warm"
            >
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-lie"
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active rooms" value={stats.rooms.active} />
          <StatCard label="Playing now" value={stats.rooms.playing} />
          <StatCard label="Connected players" value={stats.rooms.connectedPlayers} />
          <StatCard label="Active IPs (24h)" value={stats.activity.activeIps24h} />
          <StatCard label="Events today" value={stats.activity.today} />
          <StatCard label="Events this week" value={stats.activity.thisWeek} />
          <StatCard
            label="Unique players today"
            value={stats.activity.uniquePlayersToday}
          />
          <StatCard
            label="Games started today"
            value={stats.activity.gamesStartedToday}
            hint={`${stats.activity.gamesStartedWeek} this week`}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="interrogation-card space-y-4">
            <h2 className="font-serif text-xl font-semibold text-warm">
              Room status
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p>Waiting: <span className="font-mono text-truth">{stats.rooms.waiting}</span></p>
              <p>Playing: <span className="font-mono text-truth">{stats.rooms.playing}</span></p>
              <p>Finished: <span className="font-mono text-truth">{stats.rooms.finished}</span></p>
              <p>Total rooms: <span className="font-mono text-truth">{stats.rooms.total}</span></p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-muted">Mode breakdown</p>
              {stats.rooms.modeBreakdown.map((item) => (
                <p key={item.mode}>
                  {item.mode}: <span className="font-mono">{item.count}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="interrogation-card space-y-4">
            <h2 className="font-serif text-xl font-semibold text-warm">
              Storage footprint
            </h2>
            <div className="grid grid-cols-1 gap-3 text-sm">
              <p>Rooms: <span className="font-mono text-truth">{stats.storage.rooms}</span></p>
              <p>Rounds: <span className="font-mono text-truth">{stats.storage.rounds}</span></p>
              <p>Activity events: <span className="font-mono text-truth">{stats.storage.activityEvents}</span></p>
              <p>Revealed rounds: <span className="font-mono text-truth">{stats.rounds.revealed}</span></p>
              <p>Games completed today: <span className="font-mono text-truth">{stats.activity.gamesCompletedToday}</span></p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="interrogation-card space-y-3">
            <h2 className="font-serif text-xl font-semibold text-warm">
              Top IPs (24h)
            </h2>
            {stats.activity.topIps24h.length === 0 ? (
              <p className="text-sm text-muted">No IP activity yet.</p>
            ) : (
              <div className="space-y-2">
                {stats.activity.topIps24h.map((item) => (
                  <div
                    key={item.ip}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-warm">{item.ip}</span>
                    <span className="text-muted">
                      {item.events} events · {new Date(item.lastSeen).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="interrogation-card space-y-3">
            <h2 className="font-serif text-xl font-semibold text-warm">
              Event breakdown (today)
            </h2>
            {stats.activity.byTypeToday.length === 0 ? (
              <p className="text-sm text-muted">No events logged today.</p>
            ) : (
              <div className="space-y-2">
                {stats.activity.byTypeToday.map((item) => (
                  <div
                    key={item.type}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-warm">{item.type}</span>
                    <span className="font-mono text-truth">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="interrogation-card space-y-4">
          <h2 className="font-serif text-xl font-semibold text-warm">
            Active rooms
          </h2>
          {stats.rooms.recent.length === 0 ? (
            <p className="text-sm text-muted">No active rooms.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="px-2 py-2">Code</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Players</th>
                    <th className="px-2 py-2">Mode</th>
                    <th className="px-2 py-2">Round</th>
                    <th className="px-2 py-2">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rooms.recent.map((room) => (
                    <tr key={room.roomCode} className="border-t border-border">
                      <td className="px-2 py-2 font-mono">{room.roomCode}</td>
                      <td className="px-2 py-2">{room.status}</td>
                      <td className="px-2 py-2">
                        {room.connectedCount}/{room.playerCount}
                      </td>
                      <td className="px-2 py-2">{room.mode}</td>
                      <td className="px-2 py-2">
                        {room.currentRound}/{room.targetSize}
                      </td>
                      <td className="px-2 py-2 text-muted">
                        {new Date(room.expiresAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="interrogation-card space-y-4">
          <h2 className="font-serif text-xl font-semibold text-warm">
            Recent activity
          </h2>
          {stats.activity.recent.length === 0 ? (
            <p className="text-sm text-muted">No activity logged yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.activity.recent.map((event, index) => (
                <div
                  key={`${event.createdAt}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="text-warm">{event.type}</span>
                  <span className="font-mono text-muted">{event.ip}</span>
                  <span className="text-muted">{event.route}</span>
                  <span className="text-muted">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="interrogation-card space-y-4">
          <h2 className="font-serif text-xl font-semibold text-warm">
            Data cleanup
          </h2>
          <p className="text-sm text-muted">
            Use these tools to keep MongoDB lean. Game data already auto-expires
            after about 4 hours, but activity logs persist until you purge them.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted" htmlFor="retention-days">
              Activity retention (days)
            </label>
            <input
              id="retention-days"
              type="number"
              min={1}
              max={365}
              value={activityRetentionDays}
              onChange={(event) =>
                setActivityRetentionDays(Number(event.target.value) || 7)
              }
              className="w-24 rounded-lg border border-border bg-field px-3 py-2 text-sm text-warm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              disabled={cleanupLoading}
              onClick={() => handleCleanup("purge_activity")}
              className="rounded-lg border border-border px-4 py-2 text-sm text-warm"
            >
              Purge old activity logs
            </button>
            <button
              disabled={cleanupLoading}
              onClick={() => handleCleanup("delete_finished_rooms")}
              className="rounded-lg border border-border px-4 py-2 text-sm text-warm"
            >
              Delete finished rooms
            </button>
            <button
              disabled={cleanupLoading}
              onClick={() => handleCleanup("delete_stale_rooms")}
              className="rounded-lg border border-border px-4 py-2 text-sm text-warm"
            >
              Delete expired rooms
            </button>
            <button
              disabled={cleanupLoading}
              onClick={() => handleCleanup("delete_all_rounds")}
              className="rounded-lg border border-border px-4 py-2 text-sm text-warm"
            >
              Delete all rounds
            </button>
            <button
              disabled={cleanupLoading}
              onClick={() => handleCleanup("purge_all_game_data")}
              className="rounded-lg border border-lie/40 px-4 py-2 text-sm text-lie"
            >
              Purge all game data
            </button>
          </div>

          {cleanupMessage && (
            <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-warm">
              {cleanupMessage}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
