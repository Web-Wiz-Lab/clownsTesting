const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const OFFSET_REGEX = /([+-]\d{2}:\d{2}|Z)$/;

export function isValidIsoDate(value) {
  if (!ISO_DATE_REGEX.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

export function isValidTime24(value) {
  return TIME_24_REGEX.test(value || '');
}

export function formatDateForCaspio(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

export function extractDateFromIsoDateTime(value) {
  if (!value || !value.includes('T')) return null;
  return value.split('T')[0];
}

export function extractTimeFromIsoDateTime(value) {
  if (!value || !value.includes('T')) return null;
  const match = value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

export function resolveOffset(shift) {
  const startMatch = shift?.dtstart?.match(OFFSET_REGEX);
  if (startMatch) return startMatch[1];

  const endMatch = shift?.dtend?.match(OFFSET_REGEX);
  if (endMatch) return endMatch[1];

  return '-05:00';
}

export function buildDateTime(dateIso, time24, offset) {
  return `${dateIso}T${time24}:00${offset}`;
}

export function formatTimeForDisplay(isoDateTime, timezone = 'America/New_York') {
  const date = new Date(isoDateTime);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export function assertTimeRange(startTime, endTime) {
  if (!isValidTime24(startTime) || !isValidTime24(endTime)) {
    return false;
  }

  return `${startTime}:00` < `${endTime}:00`;
}
