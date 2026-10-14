/* Sound for Outbreak, synthesised on the spot: no files, nothing to load.
   Every sound is a few oscillators and an envelope. Muted until the first input
   (browsers require it), and the choice is remembered. */

type Tone = { f: number; to?: number; type?: OscillatorType; dur: number; gain?: number; delay?: number; noise?: boolean; q?: number };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem("worm:outbreak:muted") === "1"; } catch { /* storage off */ }
const last: Record<string, number> = {};

export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; try { localStorage.setItem("worm:outbreak:muted", m ? "1" : "0"); } catch { /* storage off */ } if (master) master.gain.value = m ? 0 : 0.55; }
export function unlock() {
  if (ctx) { if (ctx.state === "suspended") void ctx.resume(); return; }
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
}

function play(tones: Tone[]) {
  if (!ctx || !master || muted) return;
  const t0 = ctx.currentTime;
  for (const t of tones) {
    const start = t0 + (t.delay ?? 0), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(t.gain ?? 0.2, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    let src: AudioScheduledSourceNode;
    if (t.noise) {
      const len = Math.ceil(ctx.sampleRate * t.dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const n = ctx.createBufferSource(); n.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(t.f, start); if (t.to) f.frequency.exponentialRampToValueAtTime(t.to, start + t.dur); f.Q.value = t.q ?? 1.2;
      n.connect(f); f.connect(g); src = n;
    } else {
      const o = ctx.createOscillator(); o.type = t.type ?? "sine";
      o.frequency.setValueAtTime(t.f, start); if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
      o.connect(g); src = o;
    }
    g.connect(master); src.start(start); src.stop(start + t.dur + 0.02);
  }
}
/** Rate-limit a sound so a crowd of worms doesn't turn into noise. */
function once(key: string, gapMs: number, tones: Tone[]) {
  const now = performance.now();
  if (now - (last[key] ?? 0) < gapMs) return;
  last[key] = now; play(tones);
}

const PENT = [0, 3, 5, 7, 10, 12, 15];
let eatStep = 0;
export const sfx = {
  eat: () => { const n = PENT[eatStep++ % PENT.length]; once("eat", 45, [{ f: 660 * 2 ** (n / 12), type: "triangle", dur: 0.09, gain: 0.12 }]); },
  split: () => once("split", 60, [{ f: 330, to: 660, type: "sine", dur: 0.14, gain: 0.14 }, { f: 990, type: "triangle", dur: 0.08, gain: 0.05, delay: 0.05 }]),
  settle: () => once("settle", 80, [{ f: 180, to: 120, type: "sine", dur: 0.16, gain: 0.12 }]),
  die: () => once("die", 70, [{ f: 220, to: 70, type: "sawtooth", dur: 0.22, gain: 0.07 }, { f: 900, to: 200, noise: true, dur: 0.18, gain: 0.08 }]),
  leadDown: () => play([{ f: 300, to: 60, type: "sawtooth", dur: 0.6, gain: 0.14 }, { f: 1200, to: 100, noise: true, dur: 0.5, gain: 0.12 }]),
  newLead: () => play([{ f: 440, type: "triangle", dur: 0.12, gain: 0.12 }, { f: 660, type: "triangle", dur: 0.12, gain: 0.12, delay: 0.1 }, { f: 880, type: "triangle", dur: 0.25, gain: 0.12, delay: 0.2 }]),
  telegraph: () => once("tele", 120, [{ f: 1400, type: "square", dur: 0.05, gain: 0.04 }, { f: 1400, type: "square", dur: 0.05, gain: 0.04, delay: 0.12 }]),
  strike: () => once("strike", 120, [{ f: 3000, to: 300, noise: true, dur: 0.25, gain: 0.16, q: 2 }, { f: 120, to: 60, type: "sine", dur: 0.25, gain: 0.2 }]),
  sweep: () => play([{ f: 300, to: 3000, noise: true, dur: 0.6, gain: 0.12, q: 0.8 }, { f: 90, to: 50, type: "sine", dur: 0.5, gain: 0.18 }]),
  tool: () => once("tool", 80, [{ f: 520, type: "square", dur: 0.06, gain: 0.05 }, { f: 780, type: "square", dur: 0.08, gain: 0.05, delay: 0.06 }]),
  bait: () => play([{ f: 880, to: 220, type: "square", dur: 0.3, gain: 0.08 }, { f: 1760, type: "sine", dur: 0.05, gain: 0.06 }]),
  dash: () => once("dash", 80, [{ f: 600, to: 2400, noise: true, dur: 0.18, gain: 0.12, q: 1.5 }]),
  click: () => play([{ f: 1200, type: "square", dur: 0.03, gain: 0.04 }]),
  hover: () => once("hover", 40, [{ f: 1800, type: "sine", dur: 0.025, gain: 0.02 }]),
  tally: (i: number) => play([{ f: 440 * 2 ** (Math.min(i, 24) / 12), type: "triangle", dur: 0.06, gain: 0.08 }]),
  dayStart: () => play([{ f: 196, type: "triangle", dur: 0.5, gain: 0.14 }, { f: 294, type: "triangle", dur: 0.5, gain: 0.1, delay: 0.08 }, { f: 392, type: "triangle", dur: 0.7, gain: 0.08, delay: 0.16 }]),
  win: () => play([0, 4, 7, 12, 16].map((n, i) => ({ f: 330 * 2 ** (n / 12), type: "triangle" as const, dur: 0.4, gain: 0.12, delay: i * 0.09 }))),
  lose: () => play([0, -3, -7, -12].map((n, i) => ({ f: 330 * 2 ** (n / 12), type: "sawtooth" as const, dur: 0.45, gain: 0.06, delay: i * 0.14 }))),
  card: (rarity: string) => play(rarity === "epic" ? [0, 7, 12, 19].map((n, i) => ({ f: 523 * 2 ** (n / 12), type: "triangle" as const, dur: 0.35, gain: 0.1, delay: i * 0.05 })) : [{ f: rarity === "rare" ? 784 : 587, type: "triangle", dur: 0.18, gain: 0.1 }]),
  warn: () => once("warn", 900, [{ f: 880, type: "sine", dur: 0.12, gain: 0.08 }, { f: 660, type: "sine", dur: 0.16, gain: 0.08, delay: 0.14 }])
};
