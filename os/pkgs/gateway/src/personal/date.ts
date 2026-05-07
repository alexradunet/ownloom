export type Clock = {
  now: () => Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
}

export function formatLocalTimeMinute(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

