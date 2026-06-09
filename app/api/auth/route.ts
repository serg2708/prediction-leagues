import { Errors, createClient } from "@farcaster/quick-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const client = createClient();

export async function GET(request: NextRequest) {
  // Because we're fetching this endpoint via `sdk.quickAuth.fetch`,
  // if we're in a mini app, the request will include the necessary `Authorization` header.
  const authorization = request.headers.get("Authorization");

  // Here we ensure that we have a valid token.
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return NextResponse.json({ message: "Missing token" }, { status: 401 });
  }

  try {
    // Now we verify the token. `domain` must match the domain of the request.
    // In our case, we're using the `getUrlHost` function to get the domain of the request
    // based on the Vercel environment. This will vary depending on your hosting provider.
    const payload = await client.verifyJwt({
      token: authorization.split(" ")[1] as string,
      domain: getUrlHost(request),
    });

    // If the token was valid, `payload.sub` will be the user's Farcaster ID.
    // This is guaranteed to be the user that signed the message in the mini app.
    // You can now use this to do anything you want, e.g. fetch the user's data from your database
    // or fetch the user's info from a service like Neynar.
    const userFid = payload.sub;

    // By default, we'll return the user's FID. Update this to meet your needs.
    return NextResponse.json({ userFid });
  } catch (e) {
    if (e instanceof Errors.InvalidTokenError) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }

    if (e instanceof Error) {
      return NextResponse.json({ message: e.message }, { status: 500 });
    }

    throw e;
  }
}

function getUrlHost(_request: NextRequest) {
  // Use server-side env vars exclusively — never trust Origin/Host headers
  // for security-critical JWT domain validation (those headers are attacker-controlled).
  if (process.env.NEXT_PUBLIC_URL) {
    return new URL(process.env.NEXT_PUBLIC_URL).host;
  }
  if (process.env.VERCEL_URL) {
    return process.env.VERCEL_URL; // already just the host on Vercel
  }
  return "localhost:3000";
}
