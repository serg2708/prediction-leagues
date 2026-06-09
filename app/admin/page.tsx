"use client";
import { useCallback, useEffect, useState } from "react";
import { SportIcon } from "@/app/components/Icons";
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


function getOutcomes(sport: Sport, match: Match): { value: PredictionOutcome; label: string }[] {
  if (sport === "football") return [
    { value: "home", label: match.team_home },
    { value: "draw", label: "Draw" },
    { value: "away", label: match.team_away },
  ];
  return [
    { value: "team1", label: match.team_home },
    { value: "team2", label: match.team_away },
  ];
}

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
  onFinished,
}: {
  match: Match;
  sport: Sport;
  onFinished: (id: string) => void;
}) {
  const [selected, setSelected] = useState<PredictionOutcome | null>(
    match.result ?? null
  );
  const [scoreHome, setScoreHome] = useState<string>(match.score_home?.toString() ?? "");
  const [scoreAway, setScoreAway] = useState<string>(match.score_away?.toString() ?? "");
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(match.status === "finished");

  const outcomes = getOutcomes(sport, match);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/matches/${match.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

function LeagueBlock({ league, onDeleted }: { league: League; onDeleted: (id: string) => void }) {
  const [open, setOpen]         = useState(false);
  const [matches, setMatches]   = useState<Match[]>([]);
  const [loadingM, setLoadingM] = useState(false);
  const [competition, setComp]  = useState(league.competition_id ?? "PL");
  const [tournament, setTournament]   = useState(league.competition_id ?? "");
  const [tournamentQ, setTournamentQ] = useState("");
  const [tournamentResults, setTournamentResults] = useState<{ slug: string; name: string }[]>([]);
  const [searching, setSearching]     = useState(false);
  const [searchErr, setSearchErr]     = useState<string | null>(null);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<string | null>(null);
  const [syncErr, setSyncErr]   = useState<string | null>(null);
  const [paying, setPaying]     = useState(false);
  const [payMsg, setPayMsg]     = useState<string | null>(null);
  const [payErr, setPayErr]     = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [regMsg, setRegMsg]     = useState<string | null>(null);
  const [regErr, setRegErr]     = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr]     = useState<string | null>(null);

  async function registerOnChain() {
    setRegistering(true);
    setRegMsg(null);
    setRegErr(null);
    const res = await fetch("/api/admin/register-league", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league_id: league.id }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setRegistering(false);
    if (json.ok) {
      setRegMsg("Registered on-chain ✓");
    } else {
      setRegErr(json.error ?? "Error");
    }
  }

  async function finalise() {
    setPaying(true);
    setPayMsg(null);
    setPayErr(null);
    const res = await fetch("/api/admin/finalise-league", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league_id: league.id }),
    });
    const json = await res.json() as { ok?: boolean; winnerName?: string; txHash?: string; payout?: string; error?: string };
    setPaying(false);
    if (json.ok) {
      const tx = json.txHash ? ` · tx: ${json.txHash.slice(0, 10)}…` : (json.payout ?? "");
      setPayMsg(`Paid out to ${json.winnerName ?? json.txHash}${tx}`);
    } else {
      setPayErr(json.error ?? "Error");
    }
  }

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
      `/api/admin/search-tournaments?sport=${league.sport}&q=${encodeURIComponent(tournamentQ)}`
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
      headers: { "Content-Type": "application/json" },
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

  async function deleteLeague() {
    const poolWarning = Number(league.pool_usdc) > 0
      ? `\n\n⚠️ Pool has $${league.pool_usdc} USDC — refund participants on-chain manually.`
      : "";
    if (!confirm(`Delete league "${league.name}"? This cannot be undone.${poolWarning}`)) return;
    setDeleting(true);
    setDelErr(null);
    const res = await fetch("/api/admin/delete-league", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league_id: league.id }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    setDeleting(false);
    if (json.ok) {
      onDeleted(league.id);
    } else {
      setDelErr(json.error ?? "Error");
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
          <span style={{ display: "flex" }}><SportIcon sport={league.sport} size={22} /></span>
          <div>
            <div className={styles.leagueName}>{league.name}</div>
            <div className={styles.leagueMeta}>
              {league.invite_code} · ${league.pool_usdc} pool · {league.status}
              {league.competition_id && <> · <span style={{ color: "#aaa" }}>{league.competition_id}</span></>}
            </div>
          </div>
        </div>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▼</span>
      </button>

      <div className={styles.syncRow}>
        <button
          type="button"
          className={styles.syncBtn}
          style={{ background: "#444" }}
          disabled={registering}
          onClick={registerOnChain}
        >
          {registering ? "Registering…" : "⛓ Re-register on chain"}
        </button>
        {regMsg && <span className={styles.syncMsg}>{regMsg}</span>}
        {regErr && <span className={styles.syncErr}>{regErr}</span>}
        {league.status === "pending" && (
          <>
            <button
              type="button"
              className={styles.syncBtn}
              style={{ background: "#8b0000", marginLeft: "auto" }}
              disabled={deleting}
              onClick={deleteLeague}
            >
              {deleting ? "Deleting…" : "🗑 Delete league"}
            </button>
            {delErr && <span className={styles.syncErr}>{delErr}</span>}
          </>
        )}
      </div>

      {league.status === "finished" && (
        <div className={styles.syncRow}>
          <button
            type="button"
            className={styles.syncBtn}
            style={{ background: "#1a6fff" }}
            disabled={paying}
            onClick={finalise}
          >
            {paying ? "Processing…" : "💸 Payout winner"}
          </button>
          {payMsg && <span className={styles.syncMsg}>{payMsg}</span>}
          {payErr && <span className={styles.syncErr}>{payErr}</span>}
        </div>
      )}

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
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null); // null = checking
  const [input, setInput]       = useState("");
  const [authErr, setAuthErr]   = useState(false);
  const [leagues, setLeagues]   = useState<League[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const frame = document.querySelector(".app-frame") as HTMLElement | null;
    if (!frame) return;
    const prev = frame.style.maxWidth;
    frame.style.maxWidth = "100%";
    return () => { frame.style.maxWidth = prev; };
  }, []);

  // Check existing session cookie on mount
  useEffect(() => {
    fetch("/api/admin/ping").then(async (r) => {
      if (!r.ok) { setLoggedIn(false); return; }
      setLoggedIn(true);
      const { data } = await supabase
        .from("leagues")
        .select("*")
        .order("created_at", { ascending: false });
      setLeagues((data as League[]) ?? []);
    });
  }, []);

  async function login() {
    setLoading(true);
    setAuthErr(false);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: input }),
    });
    setLoading(false);
    if (!res.ok) { setAuthErr(true); return; }
    setLoggedIn(true);
    setInput("");
    await fetchLeagues();
  }

  async function signOut() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setLoggedIn(false);
    setLeagues([]);
  }

  async function fetchLeagues() {
    const { data } = await supabase
      .from("leagues")
      .select("*")
      .order("created_at", { ascending: false });
    setLeagues((data as League[]) ?? []);
  }

  if (loggedIn === null) {
    return <div className={styles.authGate}><div className={styles.authTitle}>Loading…</div></div>;
  }

  if (!loggedIn) {
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
        <button type="button" className={styles.signOut} onClick={signOut}>
          Sign out
        </button>
      </div>

      {leagues.length === 0 ? (
        <div className={styles.empty}>No leagues found</div>
      ) : (
        leagues.map((l) => (
          <LeagueBlock
            key={l.id}
            league={l}
            onDeleted={(id) => setLeagues((prev) => prev.filter((x) => x.id !== id))}
          />
        ))
      )}
    </div>
  );
}
