import type { Cost } from "@agentclientprotocol/sdk";
import type { Session } from "../state";

const amounts = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const cents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatCost(cost?: Cost | null): string {
    if (cost == null) return "Not reported";
    if (!Number.isFinite(cost.amount) || cost.amount < 0 || !/^[A-Z]{3}$/.test(cost.currency) || cost.currency.length !== 3) return "Unavailable";
  // Keep cent-scale and larger values currency-like; retain precision below one cent.
  const amount = cost.amount > 0 && cost.amount < 0.000001
    ? String(cost.amount)
    : (cost.amount > 0.01 ? cents : amounts).format(cost.amount);
    return `${cost.currency} ${amount}`;
}

export function usageSummary(session: Session): string {
    const lines = [`Reported session cost: ${formatCost(session.usage?.cost)}`];
    if (session.usage) lines.push(`Context: ${session.usage.used.toLocaleString()} / ${session.usage.size.toLocaleString()}`);
    if (session.usage && session.usageUpdatedAt != null) {
        const received = new Date(session.usageUpdatedAt);
        if (Number.isFinite(received.getTime())) lines.push(`Last received: ${received.toLocaleString()}`);
    }
    return lines.join("\n");
}
