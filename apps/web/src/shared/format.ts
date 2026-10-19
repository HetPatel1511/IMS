// App-wide number/currency formatting, configured from org settings on load.
let locale: string | undefined;
let currencySymbol = '₹';

export function setFormatConfig(next: { locale?: string; currency?: string }) {
  if (next.locale) locale = next.locale;
  if (next.currency) currencySymbol = next.currency;
}

export function getCurrencySymbol() {
  return currencySymbol;
}

export function formatNumber(value: unknown) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(n);
}
