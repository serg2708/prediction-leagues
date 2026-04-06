/**
 * Internal notification sender.
 * POST /api/notify
 * Body: { fids: number[], title: string, body: string, targetUrl?: string }
 *
 * Looks up active tokens for the given FIDs and fans out to
 * the Farcaster notification endpoint.
 * Protected by NOTIFY_SECRET to prevent abuse.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

interface NotifyRequest {
  fids: number[];
  title: string;
  body: string;
  targetUrl?: string;
}

interface TokenRow {
  fid: number;
  token: string;
  url: string;
}

export async function POST(req: NextRequest) {
  // Simple bearer-token auth so only our backend can call this
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.NOTIFY_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fids, title, body, targetUrl } = (await req.json()) as NotifyRequest;
  if (!fids?.length || !title || !body) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Fetch active tokens for these FIDs
  const { data: rows } = await supabase
    .from("notification_tokens")
    .select("fid, token, url")
    .in("fid", fids)
    .eq("enabled", true);

  if (!rows?.length) {
    return NextResponse.json({ sent: 0 });
  }

  // Group tokens by their notification URL (each Mini App install can differ)
  const byUrl = new Map<string, TokenRow[]>();
  for (const row of rows as TokenRow[]) {
    const list = byUrl.get(row.url) ?? [];
    list.push(row);
    byUrl.set(row.url, list);
  }

  const results = await Promise.allSettled(
    Array.from(byUrl.entries()).map(async ([url, tokenRows]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId: crypto.randomUUID(),
          title,
          body,
          targetUrl: targetUrl ?? process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000",
          tokens: tokenRows.map((r) => r.token),
        }),
      });
      if (!res.ok) throw new Error(`Notification server ${url} returned ${res.status}`);
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ sent: rows.length, failed });
}
