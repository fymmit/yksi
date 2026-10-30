import { expect, test } from "bun:test";
import { newSession } from "../src/state";
import { formatCost, usageSummary } from "../src/ui/usage";

test("reported costs distinguish zero, small values, missing and invalid data", () => {
  expect(formatCost({ amount: 0, currency: "USD" })).toBe("USD 0.00");
  expect(formatCost({ amount: 0.045, currency: "USD" })).toBe("USD 0.05");
  expect(formatCost({ amount: 0.01, currency: "USD" })).toBe("USD 0.01");
  expect(formatCost({ amount: 0.010001, currency: "USD" })).toBe("USD 0.01");
  expect(formatCost({ amount: 0.015, currency: "USD" })).toBe("USD 0.02");
  expect(formatCost({ amount: 0.0099, currency: "USD" })).toBe("USD 0.0099");
  expect(formatCost({ amount: 1234.56, currency: "CAD" })).toBe("CAD 1,234.56");
  expect(formatCost({ amount: 0.000001, currency: "EUR" })).toBe("EUR 0.000001");
  expect(formatCost({ amount: 1e-9, currency: "USD" })).toBe("USD 1e-9");
  expect(formatCost()).toBe("Not reported");
  expect(formatCost(null)).toBe("Not reported");
  for (const amount of [NaN, Infinity, -Infinity, -1]) {
    expect(formatCost({ amount, currency: "USD" })).toBe("Unavailable");
  }
  for (const currency of ["", "$", "USD\n", "not-currency"]) {
    expect(formatCost({ amount: 1, currency })).toBe("Unavailable");
  }
});

test("usage summaries handle new and legacy sessions without inventing receipt times", () => {
  const session = newSession("demo", "/project");
  expect(usageSummary(session)).toBe("Reported session cost: Not reported");
  session.usage = { used: 100, size: 200, cost: { amount: 0, currency: "USD" } };
  expect(usageSummary(session)).toBe("Reported session cost: USD 0.00\nContext: 100 / 200");
  session.usageUpdatedAt = 0;
  expect(usageSummary(session)).toContain(`Last received: ${new Date(0).toLocaleString()}`);
  session.usageUpdatedAt = NaN;
  expect(usageSummary(session)).not.toContain("Invalid Date");
});
