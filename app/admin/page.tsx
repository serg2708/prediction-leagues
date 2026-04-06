"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { League, Match, PredictionOutcome, Sport } from "@/lib/types";
import styles from "./page.module.css";

const FOOTBALL_COMPETITIONS = [
  { value: "PL",  label: "Premier League" },
  { value: "CL",  label: "Champions League" },
  { value: "BL1", label: "Bundesliga" },
  { value: "SA",  label: "Serie A" },
  { value: "PD",  label: "La Liga" },
  { value: "FL1", label: "Ligue 1" },
];

const SPORT_EMOJI: Record<Sport, string> = { football: "⚽", cs2: "🎮", nba: "🏀" };

const OUTCOMES_BY_SPORT: Record<Sport, { value: PredictionOutcome; label: string }[]> = {
  football: [
    { value: "home", label: "Home" },
    { value: "draw", label: "Draw" },
    { value: "away", label: "Away" },
  ],
  cs2: [
    { value: "team1", label: "Team 1" },
    { value: "team2", label: "Team 2" },
  ],
  nba: [
    { value: "team1", label: "Home" },
    { value: "team2", label: "Away" },
  ],
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Match row ──────────────────────────────────────────────────────────────────

function MatchRow({
  match,
  sport,
  secret,
  onFinished,
}: {
  match: Match;
  sport: Sport;
  secret: string;
  onFinished: (id: string) => void;
}) {
  const [selected, setSelected] = useState<PredictionOutcome | null>(
    match.result ?? null
  );
  const [scoreHome, setScoreHome] = useState<string>(match.score_home?.toString() ?? "");
  const [scoreAway, setScoreAway] = useState<string>(match.score_away?.toString() ?? "");
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(match.status === "finished");

  const outcomes = OUTCOMES_BY_SPORT[sport];

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/matches/${match.id}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        result:     selected,
        score_home: scoreHome !== "" ? Number(scoreHome) : undefined,
        score_away: scoreAway !== "" ? Number(scoreAway) : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setDone(true);
      onFinished(match.id);
    }
  }

  return (
    <tr className={styles.matchRow}>
      <td className={styles.teams}>
        {match.team_home} <span style={{ color: "#555" }}>vs</span> {match.team_away}
      </td>
      <td className={styles.matchDate}>{fmt(match.starts_at)}</td>
      <td>
        <span
          className={`${styles.statusBadge} ${
            match.status === "live"
              ? styles.statusLive
              : match.status === "finished"
              ? styles.statusFinished
              : styles.statusUpcoming
          }`}
        >
          {match.status}
        </span>
      </td>
      <td>
        {done ? (
          <span className={styles.resultDone}>
            ✓ {match.result ?? selected}
          </span>
        ) : (
          <div className={styles.resultCell}>
            {outcomes.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`${styles.outcomeBtn} ${selected === o.value ? styles.outcomeBtnActive : ""}`}
                onClick={() => setSelected(o.value)}
              >
                {o.label}
              </button>
            ))}
            {sport === "football" && (
              <>
                <input
                  className={styles.scoreInput}
                  type="number"
                  min={0}
                  placeholder="H"
                  value={scoreHome}
                  onChange={(e) => setScoreHome(e.target.value)}
                />
                <span style={{ color: "#555", fontSize: 12 }}>:</span>
                <input
                  className={styles.scoreInput}
                  type="number"
                  min={0}
                  placeholder="A"
                  value={scoreAway}
                  onChange={(e) => setScoreAway(e.target.value)}
                />
              </>
            )}
            <button
              type="button"
              className={styles.confirmBtn}
              disabled={!selected || saving}
              onClick={confirm}
            >
              {saving ? "..." : "Confirm"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── League block ───────────────────────────────────────────────────────────────

function LeagueBlock({ league, secret }: { league: League; secret: string }) {
  const [open, setOpen]         = useState(false);
  const [matches, setMatches]   = useState<Match[]>([]);
  const [loadingM, setLoadingM] = useState(false);
  const [competition, setComp]  = useState("PL");
  const [tournament, setTournament]   = useState("");
  const [tournamentQ, setTournamentQ] = useState("");
  const [tournamentResults, setTournamentResults] = useState<{ slug: string; name: string }[]>([]);
  const [searching, setSearching]     = useState(false);
  const [searchErr, setSearchErr]     = useState<string | null>(null);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<string | null>(null);
  const [syncErr, setSyncErr]   = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    setLoadingM(true);
    const { data } = await supabase
      .from("matches")
      .select("*")
      .eq("league_id", league.id)
      .order("starts_at", { ascending: true });
    setMatches((data as Match[]) ?? []);
    setLoadingM(false);
  }, [league.id]);

  useEffect(() => {
    if (open && matches.length === 0) loadMatches();
  }, [open, matches.length, loadMatches]);

  async function searchTournaments() {
    if (!tournamentQ.trim()) return;
    setSearching(true);
    setTournamentResults([]);
    setSearchErr(null);
    const res = await fetch(
      `/api/admin/search-tournaments?sport=${league.sport}&q=${encodeURIComponent(tournamentQ)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const json = await res.json() as { slug: string; name: string }[] | { error: string };
    if (!res.ok || !Array.isArray(json)) {
      setSearchErr((json as { error: string }).error ?? `HTTP ${res.status}`);
    } else if (json.length === 0) {
      setSearchErr("No tournaments found — try a shorter query");
    } else {
      setTournamentResults(json);
    }
    setSearching(false);
  }

  async function syncMatches() {
    setSyncing(true);
    setSyncMsg(null);
    setSyncErr(null);
    const res = await fetch("/api/admin/sync-matches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        league_id:   league.id,
        sport:       league.sport,
        competition: league.sport === "football" ? competition : undefined,
        tournament:  league.sport === "cs2" && tournament ? tournament : undefined,
      }),
    });
    const json = await res.json() as { ok?: boolean; inserted?: number; error?: string };
    setSyncing(false);
    if (json.ok) {
      setSyncMsg(`+${json.inserted} matches added`);
      setMatches([]);
      loadMatches();
    } else {
      setSyncErr(json.error ?? "Error");
    }
  }

  function onFinished(id: string) {
    setMatches((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "finished" } : m))
    );
  }

  return (
    <div className={styles.leagueBlock}>
      <button type="button" className={styles.leagueHeader} onClick={() => setOpen((o) => !o)}>
        <div className={styles.leagueInfo}>
          <span style={{ fontSize: 22 }}>{SPORT_EMOJI[league.sport]}</span>
          <div>
            <div className={styles.leagueName}>{league.name}</div>
            <div className={styles.leagueMeta}>
              {league.invite_code} · ${league.pool_usdc} pool · {league.status}
            </div>
          </div>
        </div>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▼</span>
      </button>

      {open && (
        <>
          {/* Sync row */}
          <div className={styles.syncRow}>
            {league.sport === "football" && (
              <select
                className={styles.select}
                value={competition}
                onChange={(e) => setComp(e.target.value)}
              >
                {FOOTBALL_COMPETITIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            )}
            {league.sport === "cs2" && (
              <>
                <input
                  className={styles.select}
                  type="text"
                  placeholder="e.g. BLAST, IEM, ESL…"
                  value={tournamentQ}
                  onChange={(e) => setTournamentQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchTournaments()}
                />
                <button
                  type="button"
                  className={styles.syncBtn}
                  style={{ background: "#444" }}
                  disabled={searching}
                  onClick={searchTournaments}
                >
                  {searching ? "…" : "Find"}
                </button>
                {tournamentResults.length > 0 && (
                  <select
                    className={styles.select}
                    value={tournament}
                    onChange={(e) => setTournament(e.target.value)}
                  >
                    <option value="">— pick tournament —</option>
                    {tournamentResults.map((t) => (
                      <option key={t.slug} value={t.slug}>{t.name}</option>
                    ))}
                  </select>
                )}
                {searchErr && (
                  <span className={styles.syncErr}>{searchErr}</span>
                )}
                {tournament && (
                  <span className={styles.syncMsg} style={{ color: "#aaa" }}>
                    slug: {tournament}
                  </span>
                )}
              </>
            )}
            <button
              type="button"
              className={styles.syncBtn}
              disabled={syncing}
              onClick={syncMatches}
            >
              {syncing ? "Syncing…" : "Sync matches"}
            </button>
            {syncMsg && <span className={styles.syncMsg}>{syncMsg}</span>}
            {syncErr && <span className={styles.syncErr}>{syncErr}</span>}
          </div>

          {/* Matches */}
          {loadingM ? (
            <div className={styles.loading}>Loading…</div>
          ) : matches.length === 0 ? (
            <div className={styles.empty}>No matches yet — click "Sync matches"</div>
          ) : (
            <table className={styles.matchesTable}>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Record result</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    sport={league.sport}
                    secret={secret}
                    onFinished={onFinished}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [secret, setSecret]     = useState("");
  const [input, setInput]       = useState("");
  const [authErr, setAuthErr]   = useState(false);
  const [leagues, setLeagues]   = useState<League[]>([]);
  const [loading, setLoading]   = useState(false);

  async function login() {
    setLoading(true);
    setAuthErr(false);
    // Verify by pinging a protected endpoint
    const res = await fetch("/api/admin/sync-matches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input}`,
      },
      body: JSON.stringify({}),
    });
    setLoading(false);
    // 400 = bad body but auth passed; 401 = wrong secret
    if (res.status === 401) {
      setAuthErr(true);
      return;
    }
    setSecret(input);
    loadLeagues();
  }

  async function loadLeagues() {
    const { data } = await supabase
      .from("leagues")
      .select("*")
      .order("created_at", { ascending: false });
    setLeagues((data as League[]) ?? []);
  }

  if (!secret) {
    return (
      <div className={styles.authGate}>
        <div className={styles.authTitle}>Admin Panel</div>
        <input
          className={styles.authInput}
          type="password"
          placeholder="Admin secret"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
        />
        <button
          type="button"
          className={styles.authBtn}
          onClick={login}
          disabled={loading}
        >
          {loading ? "Checking…" : "Enter"}
        </button>
        {authErr && <span className={styles.authError}>Wrong secret</span>}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin Panel</h1>
        <button
          type="button"
          className={styles.signOut}
          onClick={() => setSecret("")}
        >
          Sign out
        </button>
      </div>

      {leagues.length === 0 ? (
        <div className={styles.empty}>No leagues found</div>
      ) : (
        leagues.map((l) => (
          <LeagueBlock key={l.id} league={l} secret={secret} />
        ))
      )}
    </div>
  );
}
