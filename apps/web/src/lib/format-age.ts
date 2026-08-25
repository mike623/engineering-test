const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'}`;

/**
 * "Data from yesterday" and "data from two minutes ago" are different messages
 * and the reader has to be able to tell them apart.
 */
export function formatAge(seconds: number): string {
  if (seconds < MINUTE) {
    return 'moments ago';
  }

  if (seconds < HOUR) {
    return `${plural(Math.floor(seconds / MINUTE), 'minute')} ago`;
  }

  if (seconds < DAY) {
    return `${plural(Math.floor(seconds / HOUR), 'hour')} ago`;
  }

  return `${plural(Math.floor(seconds / DAY), 'day')} ago`;
}
