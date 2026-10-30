import { expect, test } from "bun:test";
import { messageTime } from "../src/ui/message-time";

test("message timestamps use local time and include the full date outside today", () => {
  const today = new Date(2026, 9, 30, 0, 15).getTime();
  expect(messageTime(today, new Date(2026, 9, 30, 23, 45).getTime())).toBe("00:15");
  expect(messageTime(new Date(2026, 9, 29, 23, 45).getTime(), today)).toBe("Oct 29, 2026, 23:45");
  expect(messageTime(new Date(2025, 9, 30, 12, 0).getTime(), today)).toBe("Oct 30, 2025, 12:00");
  expect(messageTime(undefined, today)).toBe("");
  expect(messageTime(Number.NaN, today)).toBe("");
});
