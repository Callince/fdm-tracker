/**
 * TeamBadge — colored chip per team. Color is a deterministic hash of
 * the team name, picked from a small palette tuned to the brand. Same
 * team name always gets the same color so the chip looks identical
 * everywhere it appears.
 */
const PALETTE = [
  ["bg-rose-100",    "dark:bg-rose-900/40",    "text-rose-800",    "dark:text-rose-200",    "bg-rose-500"],
  ["bg-amber-100",   "dark:bg-amber-900/40",   "text-amber-900",   "dark:text-amber-200",   "bg-amber-500"],
  ["bg-emerald-100", "dark:bg-emerald-900/40", "text-emerald-800", "dark:text-emerald-200", "bg-emerald-500"],
  ["bg-teal-100",    "dark:bg-teal-900/40",    "text-teal-800",    "dark:text-teal-200",    "bg-teal-500"],
  ["bg-sky-100",     "dark:bg-sky-900/40",     "text-sky-800",     "dark:text-sky-200",     "bg-sky-500"],
  ["bg-indigo-100",  "dark:bg-indigo-900/40",  "text-indigo-800",  "dark:text-indigo-200",  "bg-indigo-500"],
  ["bg-violet-100",  "dark:bg-violet-900/40",  "text-violet-800",  "dark:text-violet-200",  "bg-violet-500"],
  ["bg-fuchsia-100", "dark:bg-fuchsia-900/40", "text-fuchsia-800", "dark:text-fuchsia-200", "bg-fuchsia-500"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function colorForTeam(name: string | null | undefined): {
  bg: string; bgDark: string; text: string; textDark: string; dot: string;
} {
  if (!name) {
    return {
      bg: "bg-slate-100", bgDark: "dark:bg-slate-800",
      text: "text-slate-500", textDark: "dark:text-slate-400",
      dot: "bg-slate-400",
    };
  }
  const [bg, bgDark, text, textDark, dot] = PALETTE[hash(name.toLowerCase()) % PALETTE.length];
  return { bg, bgDark, text, textDark, dot };
}

export function TeamBadge({ name, size = "sm" }: { name: string | null; size?: "sm" | "xs" }) {
  const c = colorForTeam(name);
  const padding = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";

  if (!name) {
    return (
      <span className={`inline-block rounded-full ${c.bg} ${c.bgDark} ${c.text} ${c.textDark} ${padding}`}>
        No team
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${c.bg} ${c.bgDark} ${c.text} ${c.textDark} font-medium ${padding}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden />
      {name}
    </span>
  );
}
