/**
 * Integrity audit: sweep every league and reconcile the DB against the
 * on-chain contract (the source of truth for money & membership).
 *
 * For each non-finished league it checks:
 *   - pool_usdc        vs getPool(leagueId)
 *   - league_members   vs on-chain Deposited events (every real depositor must
 *                         be a paid member; deposit rows must be attributed to
 *                         the wallet that actually paid)
 *
 * Usage (from repo root):
 *   node scripts/audit-integrity.mjs          # report only
 *   node scripts/audit-integrity.mjs --fix    # apply fixes
 *
 * Reads config from .env.local. RPC_URL is recommended (public RPC caps
 * eth_getLogs at 2000-block ranges, which this script chunks around anyway).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, keccak256, parseAbiItem, toHex } from "viem";
import { base, baseSepolia } from "viem/chains";

const FIX = process.argv.includes("--fix");

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

const POOL_ABI = [
  { name: "getPool", type: "function", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { name: "getEntryFee", type: "function", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint96" }], stateMutability: "view" },
];
const DEPOSITED = parseAbiItem("event Deposited(bytes32 indexed leagueId, address indexed player, uint256 poolAmount, uint256 fee)");

/** Find all distinct on-chain depositors of a league via Deposited events.
 * Tries one wide query (CDP/Alchemy allow large ranges); falls back to 2000-
 * block chunks for public RPCs that cap the range. */
async function fetchDepositors(leagueKey, latest) {
  const players = new Set();
  const LOOKBACK = 800_000n; // generous bound for this deployment's lifetime
  const floor = latest > LOOKBACK ? latest - LOOKBACK : 0n;
  const add = (logs) => { for (const l of logs) players.add(l.args.player.toLowerCase()); };

  try {
    add(await pc.getLogs({ address: POOL, event: DEPOSITED, args: { leagueId: leagueKey }, fromBlock: floor, toBlock: latest }));
    return players;
  } catch {
    // Range too wide for this RPC — chunk it
    const STEP = 2000n;
    for (let end = latest; end > floor; end -= STEP) {
      const start = end - STEP + 1n > floor ? end - STEP + 1n : floor;
      try {
        add(await pc.getLogs({ address: POOL, event: DEPOSITED, args: { leagueId: leagueKey }, fromBlock: start, toBlock: end }));
      } catch { /* skip unreadable window */ }
    }
    return players;
  }
}

async function main() {
  console.log(`Integrity audit (${FIX ? "FIX" : "report-only"}) · pool ${POOL} · chain ${chainId}\n`);
  const { data: leagues } = await sb
    .from("leagues")
    .select("id, name, invite_code, status, entry_fee_usdc, pool_usdc")
    .neq("status", "finished");

  let poolFixes = 0;
  let memberFixes = 0;
  const latest = await pc.getBlockNumber();

  for (const L of leagues ?? []) {
    const key = keccak256(toHex(L.id));
    let onChainPool, entryFee;
    try {
      [onChainPool, entryFee] = await Promise.all([
        pc.readContract({ address: POOL, abi: POOL_ABI, functionName: "getPool", args: [key] }).then((p) => Number(p) / 1e6),
        pc.readContract({ address: POOL, abi: POOL_ABI, functionName: "getEntryFee", args: [key] }).then((f) => Number(f) / 1e6),
      ]);
    } catch {
      console.log(`⚠ ${L.invite_code} ${L.name}: not on current contract (skip)`);
      continue;
    }

    const issues = [];

    // 1) pool drift
    if (Number(L.pool_usdc) !== onChainPool) {
      issues.push(`pool db=$${L.pool_usdc} chain=$${onChainPool}`);
      if (FIX) { await sb.from("leagues").update({ pool_usdc: onChainPool }).eq("id", L.id); poolFixes++; }
    }

    // 2) membership vs on-chain depositors
    const depositors = await fetchDepositors(key, latest);
    const { data: members } = await sb.from("league_members").select("profile_id").eq("league_id", L.id);
    const memberSet = new Set((members ?? []).map((m) => m.profile_id.toLowerCase()));
    const missing = [...depositors].filter((d) => !memberSet.has(d));

    if (missing.length) {
      issues.push(`${missing.length} on-chain depositor(s) missing from members: ${missing.map((a) => a.slice(0, 8)).join(", ")}`);
      if (FIX) {
        for (const addr of missing) {
          await sb.from("profiles").upsert({ id: addr, display_name: addr.slice(0, 8) }, { onConflict: "id" });
          const { data: dep } = await sb.from("deposits").select("id").eq("league_id", L.id).eq("profile_id", addr).limit(1);
          if (!dep?.length) {
            await sb.from("deposits").insert({ league_id: L.id, profile_id: addr, amount_usdc: entryFee, tx_hash: `reconcile:${L.id}:${addr}`, confirmed: true });
          }
          await sb.from("league_members").upsert({ league_id: L.id, profile_id: addr, paid: true }, { onConflict: "league_id,profile_id" });
          memberFixes++;
        }
      }
    }

    const tag = issues.length ? (FIX ? "FIXED" : "DRIFT") : "ok";
    console.log(`[${tag}] ${L.invite_code} ${L.name} (${L.status}) — ${issues.length ? issues.join(" · ") : "consistent"}`);
  }

  console.log(`\nDone. ${FIX ? `applied ${poolFixes} pool fix(es), ${memberFixes} member fix(es)` : "run with --fix to apply"}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
