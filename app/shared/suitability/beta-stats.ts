// beta-stats.ts — fonction beta incomplete reguliere et son inverse.
//
// Necessaire pour lire un intervalle de credibilite sur une posterior
// Beta(a,b) : P(p <= x) (betai) et son quantile inverse (betaQuantile).
// Implemente depuis les formules de base (log-gamma de Lanczos + fraction
// continue de Numerical Recipes + bissection), sans dependance externe,
// reproductible a ~1e-10.
//
// Port fidele de _byan/mcp/byan-mcp-server/lib/suitability.js. Fonctions
// pures : aucun effet de bord.

const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

// Logarithme naturel de la fonction Gamma (approximation de Lanczos, avec
// reflexion pour z < 0.5).
export function lgamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  }
  z -= 1;
  let x = LANCZOS_C[0];
  for (let i = 1; i < LANCZOS_G + 2; i++) x += LANCZOS_C[i] / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Fraction continue de la beta incomplete (methode de Lentz). Le plafond a
// 300 iterations est un filet, pas une limite de travail : betai n'appelle
// cette fonction que du cote qui converge vite (x < (a+1)/(a+b+2), garanti par
// sa reflexion), ou Lentz atteint la tolerance 1e-12 en quelques dizaines de
// pas pour toute posterior realiste.
function betacf(x: number, a: number, b: number): number {
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

// Beta incomplete reguliere I_x(a,b) = P(X <= x) pour X ~ Beta(a,b).
export function betai(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logBeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(logBeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betacf(x, a, b)) / a;
  }
  return 1 - (front * betacf(1 - x, b, a)) / b;
}

// CDF inverse : le plus petit x tel que I_x(a,b) = p. Bissection —
// monotone, sans dependance, deterministe. 100 divisions par deux resserrent
// l'intervalle sous 1e-30, bien plus fin que la precision de betai, donc le
// quantile est exact pour l'usage vise ici.
export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (betai(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
