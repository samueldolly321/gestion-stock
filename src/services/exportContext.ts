// Contexte d'export : la raison sociale courante, injectée en en-tête des
// documents PDF / Excel. Renseignée par App quand les réglages sont chargés.

let companyName = '';

export function setExportCompany(name?: string | null): void {
  companyName = (name || '').trim();
}

export function getExportCompany(): string {
  return companyName;
}
