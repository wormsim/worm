/* Four small looping drawings, one per rule, each with the same worm. Pure SVG
   and CSS: they illustrate a rule, they never show a number from a run. */

const BODY = "M8 38 C14 28, 20 48, 28 38 S 42 28, 50 36";

export function RuleGlyph({ kind }: { kind: "rent" | "work" | "die" | "split" }) {
  if (kind === "rent") return <svg className="glyph g-rent" viewBox="0 0 64 64" aria-hidden="true">
    <path className="body" d={BODY} />
    <path className="gut" d={BODY} pathLength={100} />
    <circle className="head" cx="50" cy="36" r="3.6" />
    <circle className="drop" cx="28" cy="44" r="2" />
    <circle className="drop d2" cx="18" cy="44" r="2" />
  </svg>;
  if (kind === "work") return <svg className="glyph g-work" viewBox="0 0 64 64" aria-hidden="true">
    <g className="wiggle">
      <path className="body" d={BODY} />
      <path className="gut" d={BODY} pathLength={100} />
      <circle className="halo" cx="50" cy="36" r="9" />
      <circle className="head" cx="50" cy="36" r="3.6" />
    </g>
    <circle className="pellet" cx="60" cy="6" r="2.6" />
  </svg>;
  if (kind === "die") return <svg className="glyph g-die" viewBox="0 0 64 64" aria-hidden="true">
    <path className="body" d={BODY} pathLength={100} />
    <circle className="head" cx="50" cy="36" r="3.6" />
    {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} className={`speck s${i}`} cx={14 + i * 7} cy={38 + (i % 2 ? -3 : 3)} r="1.8" />)}
  </svg>;
  return <svg className="glyph g-split" viewBox="0 0 64 64" aria-hidden="true">
    <g className="half l"><path className="body" d="M8 38 C14 28, 20 48, 29 38" /><circle className="head" cx="8" cy="38" r="3.2" /></g>
    <g className="half r"><path className="body" d="M29 38 S 42 28, 50 36" /><circle className="head" cx="50" cy="36" r="3.6" /></g>
    <circle className="snap" cx="29" cy="38" r="5" />
  </svg>;
}
