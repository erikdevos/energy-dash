/*
 * Voor en na nieuwe kozijnen: een eerlijke meting corrigeert voor het weer. Een koude, donkere week kost meer stroom dan een
 * zonnige, ongeacht je kozijnen. Daarom leert het model uit de dagen vóór de vervanging hoeveel een radiator verbruikt bij een
 * bepaalde temperatuur en zonnestraling (verbruik = a + b × temperatuur + c × zonnestraling), en voorspelt het wat de dagen
 * erna zonder nieuwe kozijnen hadden gekost. Het verschil met wat er echt verbruikt is, is het effect van de kozijnen.
 */

export interface Day {
  /** begin van de dag (ms) */
  from: number;
  /** verbruik van de radiator die dag (kWh) */
  kwh: number;
  /** gemiddelde buitentemperatuur (°C) */
  temp: number;
  /** zonnestraling (kWh/m² over de dag) */
  rad: number;
  /** de pelletkachel brandde die dag (neemt warmtevraag over van de radiator) */
  pellet?: boolean;
}

export interface WindowEffect {
  nBefore: number;
  nAfter: number;
  /** a, b, c (en d voor de pelletkachel, alleen als die dagen verschillen) */
  coef: number[] | null;
  /** is de pelletkachel in het model meegenomen */
  withPellet: boolean;
  /** standaardafwijking van de dagen voor de vervanging rond het model (kWh) */
  sd: number;
  /** verwacht verbruik zonder nieuwe kozijnen, voor alle dagen (null als het model nog niet te maken is) */
  predicted: Array<number | null>;
  actualAfter: number;
  predictedAfter: number;
  /** besparing in kWh en als fractie, met de onzekerheid als ± in kWh */
  saving: number | null;
  savingPct: number | null;
  margin: number | null;
}

/** Minimaal aantal dagen vóór de vervanging voor een betrouwbaar model. */
export const MIN_BEFORE = 10;

/** Kleinste kwadraten via de normaalvergelijkingen (Gauss-eliminatie), voor een paar variabelen. */
function ols(X: number[][], y: number[]): number[] | null {
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, i) => [...Array.from({ length: k }, (_, j) => X.reduce((s, x) => s + x[i] * x[j], 0) + (i === j && i > 0 ? 1e-9 : 0)), X.reduce((s, x, r) => s + x[i] * y[r], 0)]);
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-9) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row, i) => row[k] / row[i]);
}

export function windowEffect(days: Day[], splitMs: number | null): WindowEffect {
  const DAY = 24 * 3600_000;
  const before = splitMs === null ? days : days.filter((d) => d.from + DAY <= splitMs);
  const after = splitMs === null ? [] : days.filter((d) => d.from >= splitMs);
  // de pelletkachel telt alleen mee als er dagen mét en zonder zijn
  const pelletDays = days.filter((d) => d.pellet).length;
  const withPellet = pelletDays > 0 && pelletDays < days.length;
  const row = (d: Day) => (withPellet ? [1, d.temp, d.rad, d.pellet ? 1 : 0] : [1, d.temp, d.rad]);
  let coef: number[] | null = null;
  let sd = 0;
  if (before.length >= MIN_BEFORE) {
    coef = ols(before.map(row), before.map((d) => d.kwh));
    if (coef) {
      const c = coef;
      const res = before.map((d) => d.kwh - row(d).reduce((s, x, i) => s + x * c[i], 0));
      sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / Math.max(1, before.length - c.length));
    }
  }
  const predict = (d: Day) => (coef ? Math.max(0, row(d).reduce((s, x, i) => s + x * coef![i], 0)) : null);
  const predicted = days.map(predict);
  const actualAfter = after.reduce((s, d) => s + d.kwh, 0);
  const predictedAfter = after.reduce((s, d) => s + (predict(d) ?? 0), 0);
  const ok = coef !== null && after.length > 0 && predictedAfter > 0;
  return {
    nBefore: before.length,
    nAfter: after.length,
    coef,
    withPellet,
    sd,
    predicted,
    actualAfter,
    predictedAfter,
    saving: ok ? predictedAfter - actualAfter : null,
    savingPct: ok ? (predictedAfter - actualAfter) / predictedAfter : null,
    margin: ok ? sd * Math.sqrt(after.length) : null,
  };
}
