import { format, parseISO } from 'date-fns';

export function formatPKDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'd MMM yyyy');
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'd MMM yyyy, h:mm a');
}

export function getTodayPKT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

export function getCurrentTimePKT(): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Current PKT time in HH:MM 24h form — suitable for direct string
 * comparison against an `<input type="time">` value. Used by the booking
 * form to reject past times on today's date.
 */
export function getNowTimePKT24(): string {
  return new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export interface PrayerBlock {
  name: string;
  start: string;
  end: string;
}

export function getPrayerBlocks(): PrayerBlock[] {
  // Approximate prayer times for Pakistan (Lahore-ish)
  // In production, use an API like aladhan.com
  return [
    { name: 'Fajr', start: '05:00', end: '05:30' },
    { name: 'Zuhr', start: '12:30', end: '13:00' },
    { name: 'Asr', start: '15:30', end: '16:00' },
    { name: 'Maghrib', start: '18:00', end: '18:30' },
    { name: 'Isha', start: '19:30', end: '20:00' },
  ];
}
