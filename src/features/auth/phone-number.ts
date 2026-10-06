const ETHIOPIAN_MOBILE_PATTERN = /^[79]\d{8}$/;

export function normalizeLocalPhoneNumber(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00251')) digits = digits.slice(5);
  else if (digits.startsWith('251')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 9);
}

export function formatLocalPhoneNumber(value: string): string {
  const digits = normalizeLocalPhoneNumber(value);
  const groups = [digits.slice(0, 1), digits.slice(1, 3), digits.slice(3, 6), digits.slice(6, 9)];

  return groups.filter(Boolean).join(' ');
}

export function isValidEthiopianMobileNumber(value: string): boolean {
  return ETHIOPIAN_MOBILE_PATTERN.test(normalizeLocalPhoneNumber(value));
}

export function toE164PhoneNumber(value: string): string {
  return `+251${normalizeLocalPhoneNumber(value)}`;
}

export function toReadablePhoneNumber(value: string): string {
  return `+251 ${formatLocalPhoneNumber(value)}`;
}
