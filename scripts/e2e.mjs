/**
 * E2E helper for the Sepolia mainnet-readiness run.
 *
 *   node scripts/e2e.mjs state <INVITE_CODE>
 *     Dump a league's full state: DB row, members+points, matches,
 *     on-chain pool/isPaid/isVoided/hasDeposited, and members' USDC balances.
 *     Run before and after each phase to compare.
 *
 *   node scripts/e2e.mjs matches <INVITE_CODE> <N>
 *     Insert N synthetic matches into the league (start in +2h, no external_id
 *     so result-polling and abandon sweeps never touch them). Results are then
 *     recorded manually from the admin panel.
 *
 * Reads .env.local. Test-only tooling — never point it at mainnet data you
 * care about; `matches` inserts synthetic rows.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, keccak256, toHex } from "viem";
import { base, baseSepolia } from "viem/chains";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const chainId = Number(env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
const chain = chainId === 8453 ? base : baseSepolia;
const pc = createPublicClient({ chain, transport: http(env.RPC_URL ?? chain.rpcUrls.default.http[0]) });
const POOL = env.NEXT_PUBLIC_POOL_ADDRESS;
const USDC = chainId === 8453
  ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const POOL_ABI = [
  { name: "getPool", type: "function", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getEntryFee", type: "function", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint96" }], stateMutability: "view" },
  { name: "isPaid", type: "function", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "isVoided", type: "function", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { name: "hasDeposited", type: "function", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
];
const ERC20 = [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }];

async function getLeague(code) {
  const { data } = await sb.from("leagues").select("*").eq("invite_code", code.toUpperCase()).single();
  if (!data) { console.error(`League ${code} not found`); process.exit(1); }
  return data;
}

async function cmdState(code) {
  const L = await getLeague(code);
  const key = keccak256(toHex(L.id));

  const [pool, fee, paid, voided] = await Promise.all([
    pc.readContract({ address: POOL, abi: POOL_ABI, functionName: "getPool", args: [key] }),
    pc.readContract({ address: POOL, abi: POOL_ABI, functionName: "getEntryFee", args: [key] }),
    pc.readContract({ address: POOL, abi: POOL_ABI, functionName: "isPaid", args: [key] }),
    pc.readContract({ address: POOL, abi: POOL_ABI, functionName: "isVoided", args: [key] }),
  ]);

  console.log(`\n═══ ${L.invite_code} · ${L.name} ═══`);
  console.log(`DB:       status=${L.status}  pool_usdc=$${L.pool_usdc}  entry=$${L.entry_fee_usdc}  min_players=${L.min_players}`);
  console.log(`          needs_refund=${L.needs_refund}  payout_tx=${L.payout_tx_hash ?? "null"}  payout_error=${L.payout_error ?? "null"}`);
  console.log(`ON-CHAIN: pool=$${Number(pool) / 1e6}  entryFee=$${Number(fee) / 1e6}  isPaid=${paid}  isVoided=${voided}`);

  const { data: members } = await sb
    .from("league_leaderboard")
    .select("profile_id, points, rank")
    .eq("league_id", L.id)
    .order("rank", { ascending: true });

  console.log(`\nMEMBERS (${members?.length ?? 0}):`);
  for (const m of members ?? []) {
    const [dep, bal] = await Promise.all([
      pc.readContract({ address: POOL, abi: POOL_ABI, functionName: "hasDeposited", args: [key, m.profile_id] }),
      pc.readContract({ address: USDC, abi: ERC20, functionName: "balanceOf", args: [m.profile_id] }),
    ]);
    console.log(`  #${m.rank} ${m.profile_id.slice(0, 10)}…  ${String(m.points).padStart(3)} pts  deposited=${dep}  USDC=$${(Number(bal) / 1e6).toFixed(2)}`);
  }

  const { data: matches } = await sb
    .from("matches")
    .select("id, team_home, team_away, status, result, starts_at")
    .eq("league_id", L.id)
    .order("starts_at", { ascending: true });

  console.log(`\nMATCHES (${matches?.length ?? 0}):`);
  for (const m of matches ?? []) {
    console.log(`  ${m.team_home} vs ${m.team_away}  ${m.status}${m.result ? ` → ${m.result}` : ""}  (${m.starts_at?.slice(0, 16)})  id=${m.id.slice(0, 8)}`);
  }
  console.log();
}

async function cmdMatches(code, nRaw) {
  const n = Number(nRaw);
  if (!Number.isInteger(n) || n < 1 || n > 10) { console.error("N must be 1..10"); process.exit(1); }
  const L = await getLeague(code);

  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2h
  const rows = Array.from({ length: n }, (_, i) => ({
    league_id: L.id,
    team_home: `E2E Home ${i + 1}`,
    team_away: `E2E Away ${i + 1}`,
    sport: L.sport,
    starts_at: startsAt,
    status: "upcoming",
    external_id: null, // keep result-polling & abandon sweeps away
    competition: "e2e",
  }));

  const { data, error } = await sb.from("matches").insert(rows).select("id");
  if (error) { console.error("insert failed:", error.message); process.exit(1); }
  console.log(`Inserted ${data.length} synthetic matches into ${L.invite_code} (start +2h).`);
  console.log("Record their results from the admin panel when predictions are in.");
}

const [, , cmd, code, n] = process.argv;
if (cmd === "state" && code) await cmdState(code);
else if (cmd === "matches" && code && n) await cmdMatches(code, n);
else {
  console.log("Usage:\n  node scripts/e2e.mjs state <INVITE_CODE>\n  node scripts/e2e.mjs matches <INVITE_CODE> <N>");
  process.exit(1);
}
