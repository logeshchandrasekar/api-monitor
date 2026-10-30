const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat(undefined);

/** 99.5 -> "99.5%", 100 -> "100%", null -> "No data" (uptime is null when there are no checks yet) */
export function formatPercent(value: number | null): string {
  return value === null ? "No data" : `${percent.format(value)}%`;
}

export function formatNumber(value: number): string {
  return integer.format(value);
}
