/*
 * ISDE-subsidie voor glas (Investeringssubsidie duurzame energie en energiebesparing, RVO).
 * Bron: rvo.nl, pagina's over isolatiemaatregelen en "ISDE: wat wijzigt er vanaf 2027", gelezen op 7 november 2026.
 * De bedragen voor 2027 zijn voorgenomen en nog niet definitief. Controleer ze bij RVO voordat je erop rekent.
 */
export const ISDE_GLAS = {
  /** HR++-glas, triple of vacuümglas zonder nieuwe kozijnen, in euro per m2 */
  hr: { 2026: 25, 2027: 30 },
  /** triple of vacuümglas in nieuwe kozijnen, in euro per m2 */
  triple: { 2026: 111, 2027: 55 },
  minM2: 3,
  maxM2: 45,
  /** energiezuinige ventilatie, eenmalig, alleen samen met een isolatiemaatregel */
  ventilatie: 400,
} as const;

/** Subsidie voor een glasoppervlak: minimaal 3 m2, maximaal 45 m2. Een eventuele verdubbeling is niet bevestigd voor glas. */
export function glasBedrag(m2: number, perM2: number, verdubbeld = false): number {
  if (!(m2 >= ISDE_GLAS.minM2)) return 0;
  return Math.min(m2, ISDE_GLAS.maxM2) * perM2 * (verdubbeld ? 2 : 1);
}
