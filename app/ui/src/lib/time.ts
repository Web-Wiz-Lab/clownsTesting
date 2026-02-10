export function formatTime24To12(time24: string): string {
  const [hours24, minutes] = time24.split(':');
  let hours = parseInt(hours24, 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

export function getTimeFromDateTime(dateTimeString: string): string {
  const timeMatch = String(dateTimeString || '').match(/T(\d{2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1]}:${timeMatch[2]}`;
  }

  const date = new Date(dateTimeString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatTime(dateTimeString: string): string {
  return formatTime24To12(getTimeFromDateTime(dateTimeString));
}

export interface TimeOption {
  value: string;
  label: string;
  group: 'MORNING' | 'AFTERNOON' | 'EVENING';
}

export function generateTimeOptions(minTime24: string | null = null): TimeOption[] {
  const options: TimeOption[] = [];

  let minMinutes: number | null = null;
  if (minTime24) {
    const [minHours, minMins] = minTime24.split(':').map(Number);
    minMinutes = minHours * 60 + minMins;
  }

  const ranges: Array<{ label: 'MORNING' | 'AFTERNOON' | 'EVENING'; start: number; end: number }> = [
    { label: 'MORNING', start: 6, end: 11 },
    { label: 'AFTERNOON', start: 12, end: 17 },
    { label: 'EVENING', start: 18, end: 23 },
  ];

  ranges.forEach((range) => {
    for (let hour = range.start; hour <= range.end; hour += 1) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time24 = `${hour.toString().padStart(2, '0')}:${minute
          .toString()
          .padStart(2, '0')}`;
        const currentMinutes = hour * 60 + minute;

        if (minMinutes !== null && currentMinutes <= minMinutes) {
          continue;
        }

        options.push({
          value: time24,
          label: formatTime24To12(time24),
          group: range.label,
        });
      }
    }
  });

  return options;
}
