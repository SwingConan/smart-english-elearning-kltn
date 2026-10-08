export function formatTrendNumber(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function roundedTrendNumber(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
