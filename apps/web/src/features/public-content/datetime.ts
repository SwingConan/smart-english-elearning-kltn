const pad = (value: number) => String(value).padStart(2, '0');

export const isoToDatetimeLocal = (iso: string) => {
  const value = new Date(iso);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
};

export const datetimeLocalToIso = (value: string) => (value ? new Date(value).toISOString() : null);
