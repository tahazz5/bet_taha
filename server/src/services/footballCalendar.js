export const parisDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export function calendarDates(start, days = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || ![1, 7].includes(days)) throw new Error('Date ou période invalide.');
  const date = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) throw new Error('Date invalide.');
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
