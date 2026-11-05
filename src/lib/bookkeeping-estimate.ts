import { PUBLIC_PLANS } from "./plans";

export type BookkeepingEstimateInput = {
  orders: string;
  minutes: string;
  hourlyRate: string;
  automated: string;
};

export function estimateBookkeeping(input: BookkeepingEstimateInput) {
  const count = Number(input.orders);
  const minutes = Number(input.minutes);
  const rate = Number(input.hourlyRate);
  const share = Number(input.automated);
  const valid = Object.values(input).every((value) => value.trim() !== "") &&
    [count, minutes, rate, share].every(Number.isFinite) &&
    Number.isInteger(count) && count >= 0 && count <= 1_000_000 && minutes >= 0 && minutes <= 120 &&
    rate >= 0 && rate <= 10_000 && share >= 0 && share <= 100;

  if (!valid) return null;

  const hours = count * minutes / 60;
  const savedHours = hours * share / 100;
  const timeValue = savedHours * rate;
  const plan = PUBLIC_PLANS.find((candidate) => count <= candidate.orderLimit) ?? null;

  return {
    hours,
    manualTimeValue: hours * rate,
    savedHours,
    timeValue,
    plan,
    netTimeValue: plan ? timeValue - plan.monthlyPriceUsd : null,
  };
}
