/* The server's half of the replay check: run the shared engine and hand back the
   commitment. The browser runs the same module over the same seed and compares.

   Small cache on purpose: (seed, ticks) is a pure function, so the answer cannot
   change while the process lives. */

import { NextResponse } from "next/server";
import { RULES, simulate, WORLD_VERSION } from "../../../sim/engine";

export const dynamic = "force-dynamic";

const cache = new Map<string, unknown>();
const MAX_TICKS = 20000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const seedRaw = url.searchParams.get("seed") ?? "20261013";
  const ticksRaw = url.searchParams.get("ticks") ?? String(RULES.maxTicks);
  const seed = Number(seedRaw);
  const ticks = Number(ticksRaw);

  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 31 - 1) {
    return NextResponse.json({ error: "seed must be a 32-bit unsigned integer." }, { status: 400 });
  }
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > MAX_TICKS) {
    return NextResponse.json({ error: `ticks must be an integer between 1 and ${MAX_TICKS}.` }, { status: 400 });
  }

  const key = `${seed}:${ticks}`;
  if (!cache.has(key)) {
    const run = simulate(seed, ticks);
    cache.set(key, {
      worldVersion: WORLD_VERSION,
      seed,
      ticks: run.ticks,
      stats: run.stats,
      chain: run.chain,
      head: run.head,
      rules: RULES
    });
  }
  return NextResponse.json(cache.get(key), { headers: { "cache-control": "no-store" } });
}
