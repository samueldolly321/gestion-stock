/**
 * Encodage EAN-13 (sans dépendance) : génération d'un code valide + calcul du
 * motif de barres pour un rendu SVG scannable par une vraie douchette.
 */

// Motifs 7 modules par chiffre (1 = barre noire, 0 = espace).
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
// Parité des 6 chiffres de gauche selon le 1er chiffre.
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Clé de contrôle EAN-13 à partir des 12 premiers chiffres. */
export function ean13Checksum(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+digits12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** Génère un code-barres EAN-13 valide (12 chiffres aléatoires + clé de contrôle). */
export function generateEan13(): string {
  let base = '';
  for (let i = 0; i < 12; i++) base += Math.floor(Math.random() * 10);
  return base + ean13Checksum(base);
}

/** Vrai si `code` est un EAN-13 syntaxiquement et arithmétiquement valide. */
export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && (+code[12]) === ean13Checksum(code.slice(0, 12));
}

/** Suite de modules (bits) d'un EAN-13, ou null si le format n'est pas 13 chiffres. */
export function ean13Modules(code: string): string | null {
  if (!/^\d{13}$/.test(code)) return null;
  const parity = PARITY[+code[0]];
  let bits = '101'; // garde de départ
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === 'L' ? L : G)[+code[i]];
  bits += '01010'; // garde centrale
  for (let i = 7; i <= 12; i++) bits += R[+code[i]];
  return bits + '101'; // garde de fin
}
