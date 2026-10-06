export const FAYDA_FIN_LENGTH = 12;
export const FAYDA_CARD_NUMBER_LENGTH = 16;

export function normalizeFaydaIdentifier(value: string): string {
  return value.replace(/\D/g, '').slice(0, FAYDA_CARD_NUMBER_LENGTH);
}

export function isValidFaydaIdentifier(value: string): boolean {
  const identifier = normalizeFaydaIdentifier(value);
  return identifier.length === FAYDA_FIN_LENGTH || identifier.length === FAYDA_CARD_NUMBER_LENGTH;
}

export function formatFaydaIdentifier(value: string): string {
  return normalizeFaydaIdentifier(value).replace(/(\d{4})(?=\d)/g, '$1 ');
}
