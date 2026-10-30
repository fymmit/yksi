export function messageTime(createdAt?: number, now = Date.now()): string {
  if (createdAt == null) return "";
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date(now);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
    return time;
  return `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)}, ${time}`;
}
