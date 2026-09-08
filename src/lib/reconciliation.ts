const SCALE_DIGITS = 6;
const SCALE = 1_000_000n;
const CENT_TOLERANCE = 10_000n; // 0.01 at six-decimal scale

export interface ReconciliationLineItem {
  title: string;
  quantity: number;
  price: string;
}

export interface ShopifyOrderForReconciliation {
  currency?: string | null;
  taxes_included?: boolean | null;
  current_total_price?: string | null;
  total_price?: string | null;
  current_total_tax?: string | null;
  total_tax?: string | null;
  current_total_discounts?: string | null;
  total_discounts?: string | null;
  current_shipping_price_set?: { shop_money?: { amount?: string | null } | null } | null;
  total_shipping_price_set?: { shop_money?: { amount?: string | null } | null } | null;
  current_total_duties_set?: { shop_money?: { amount?: string | null } | null } | null;
  current_total_additional_fees_set?: { shop_money?: { amount?: string | null } | null } | null;
  total_tip_received?: string | null;
  shipping_lines?: Array<{
    discounted_price?: string | null;
    price?: string | null;
    current_discounted_price_set?: { shop_money?: { amount?: string | null } | null } | null;
  }>;
  line_items: ReconciliationLineItem[];
}

export interface ReconciliationOptions {
  includeShipping?: boolean;
  includeDiscounts?: boolean;
  includeDuties?: boolean;
  includeAdditionalFees?: boolean;
  includeTips?: boolean;
}

export interface ShopifyAdjustmentTotals {
  shipping: string;
  discounts: string;
  duties: string;
  additionalFees: string;
  tips: string;
}

export interface TotalComparison {
  matches: boolean;
  expectedTotal: string;
  actualTotal: string;
  difference: string;
  absoluteDifference: string;
}

export interface PreflightReconciliation extends TotalComparison {
  currency: string;
  lineSubtotal: string;
  taxTotal: string;
  taxesIncluded: boolean;
  adjustments: ShopifyAdjustmentTotals;
  unsupportedAdjustments: string[];
  adjustmentSummary: string | null;
  message: string | null;
}

function parseScaled(value: string | number | null | undefined): bigint {
  if (value == null || value === "") return 0n;

  const raw = typeof value === "number" ? value.toFixed(SCALE_DIGITS) : String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error(`Invalid money value: ${raw}`);

  const negative = match[1] === "-";
  const whole = BigInt(match[2]);
  const rawFraction = match[3] ?? "";
  const padded = rawFraction.padEnd(SCALE_DIGITS + 1, "0");
  let scaled = whole * SCALE + BigInt(padded.slice(0, SCALE_DIGITS) || "0");

  if (padded[SCALE_DIGITS] >= "5") scaled += 1n;
  return negative ? -scaled : scaled;
}

function formatScaled(value: bigint, minimumDecimals = 2): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  let fraction = (absolute % SCALE).toString().padStart(SCALE_DIGITS, "0");

  while (fraction.length > minimumDecimals && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }

  const rendered = `${whole.toString()}.${fraction.padEnd(minimumDecimals, "0")}`;
  return negative ? `-${rendered}` : rendered;
}

function abs(value: bigint) {
  return value < 0n ? -value : value;
}

function amountFromMoneySet(
  value?: { shop_money?: { amount?: string | null } | null } | null
): string | null {
  return value?.shop_money?.amount ?? null;
}

function shippingAmount(order: ShopifyOrderForReconciliation): bigint {
  const direct =
    amountFromMoneySet(order.current_shipping_price_set) ??
    amountFromMoneySet(order.total_shipping_price_set);
  if (direct != null) return parseScaled(direct);

  return (order.shipping_lines ?? []).reduce((total, line) => {
    const amount =
      amountFromMoneySet(line.current_discounted_price_set) ??
      line.discounted_price ??
      line.price ??
      "0";
    return total + parseScaled(amount);
  }, 0n);
}

function rawAdjustmentValues(order: ShopifyOrderForReconciliation) {
  return {
    shipping: shippingAmount(order),
    discounts: abs(parseScaled(order.current_total_discounts ?? order.total_discounts ?? "0")),
    duties: parseScaled(amountFromMoneySet(order.current_total_duties_set) ?? "0"),
    additionalFees: parseScaled(amountFromMoneySet(order.current_total_additional_fees_set) ?? "0"),
    tips: parseScaled(order.total_tip_received ?? "0"),
  };
}

export function getShopifyAdjustmentTotals(order: ShopifyOrderForReconciliation): ShopifyAdjustmentTotals {
  const values = rawAdjustmentValues(order);
  return {
    shipping: formatScaled(values.shipping),
    discounts: formatScaled(values.discounts),
    duties: formatScaled(values.duties),
    additionalFees: formatScaled(values.additionalFees),
    tips: formatScaled(values.tips),
  };
}

function buildAdjustmentSummary(values: ReturnType<typeof rawAdjustmentValues>): string | null {
  const adjustments: string[] = [];
  if (values.shipping !== 0n) adjustments.push(`shipping ${formatScaled(values.shipping)}`);
  if (values.discounts !== 0n) adjustments.push(`discounts -${formatScaled(values.discounts)}`);
  if (values.duties !== 0n) adjustments.push(`duties ${formatScaled(values.duties)}`);
  if (values.additionalFees !== 0n) adjustments.push(`additional fees ${formatScaled(values.additionalFees)}`);
  if (values.tips !== 0n) adjustments.push(`tips ${formatScaled(values.tips)}`);
  return adjustments.length ? adjustments.join(", ") : null;
}

export function compareMoneyTotals(expected: string | number, actual: string | number): TotalComparison {
  const expectedScaled = parseScaled(expected);
  const actualScaled = parseScaled(actual);
  const difference = actualScaled - expectedScaled;

  return {
    matches: abs(difference) <= CENT_TOLERANCE,
    expectedTotal: formatScaled(expectedScaled),
    actualTotal: formatScaled(actualScaled),
    difference: formatScaled(difference),
    absoluteDifference: formatScaled(abs(difference)),
  };
}

/**
 * Computes the total that the configured QuickBooks Sales Receipt payload should
 * produce before any financial transaction is created. Non-product Shopify
 * adjustments are included only when the merchant has explicitly configured the
 * corresponding QuickBooks accounting item. Transaction discounts are native QBO
 * discount lines. Tax is added only for tax-exclusive Shopify orders; Shopify line
 * and shipping prices already include tax when taxes_included=true.
 */
export function reconcileShopifyOrder(
  order: ShopifyOrderForReconciliation,
  options: ReconciliationOptions = {}
): PreflightReconciliation {
  const expectedRaw = order.current_total_price ?? order.total_price;
  if (expectedRaw == null || expectedRaw === "") {
    throw new Error("Shopify order is missing its total price");
  }

  const lineSubtotalScaled = order.line_items.reduce((total, item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      throw new Error(`Invalid quantity for ${item.title}`);
    }
    return total + parseScaled(item.price) * BigInt(item.quantity);
  }, 0n);

  const taxScaled = parseScaled(order.current_total_tax ?? order.total_tax ?? "0");
  const taxesIncluded = order.taxes_included === true;
  const values = rawAdjustmentValues(order);
  const unsupportedAdjustments: string[] = [];

  if (values.shipping !== 0n && !options.includeShipping) unsupportedAdjustments.push("shipping");
  if (values.discounts !== 0n && !options.includeDiscounts) unsupportedAdjustments.push("discounts");
  if (values.duties !== 0n && !options.includeDuties) unsupportedAdjustments.push("duties");
  if (values.additionalFees !== 0n && !options.includeAdditionalFees) unsupportedAdjustments.push("additional fees");
  if (values.tips !== 0n && !options.includeTips) unsupportedAdjustments.push("tips");

  let draftScaled = lineSubtotalScaled;
  if (options.includeShipping) draftScaled += values.shipping;
  if (options.includeDuties) draftScaled += values.duties;
  if (options.includeAdditionalFees) draftScaled += values.additionalFees;
  if (options.includeTips) draftScaled += values.tips;
  if (options.includeDiscounts) draftScaled -= values.discounts;
  if (!taxesIncluded) draftScaled += taxScaled;

  const expectedScaled = parseScaled(expectedRaw);
  const difference = draftScaled - expectedScaled;
  const matches = unsupportedAdjustments.length === 0 && abs(difference) <= CENT_TOLERANCE;
  const currency = order.currency?.trim() || "shop currency";
  const adjustmentSummary = buildAdjustmentSummary(values);

  const expectedTotal = formatScaled(expectedScaled);
  const actualTotal = formatScaled(draftScaled);
  const absoluteDifference = formatScaled(abs(difference));
  const unsupportedText = unsupportedAdjustments.length
    ? ` Missing accounting mappings: ${unsupportedAdjustments.join(", ")}.`
    : "";

  return {
    matches,
    expectedTotal,
    actualTotal,
    difference: formatScaled(difference),
    absoluteDifference,
    currency,
    lineSubtotal: formatScaled(lineSubtotalScaled),
    taxTotal: formatScaled(taxScaled),
    taxesIncluded,
    adjustments: {
      shipping: formatScaled(values.shipping),
      discounts: formatScaled(values.discounts),
      duties: formatScaled(values.duties),
      additionalFees: formatScaled(values.additionalFees),
      tips: formatScaled(values.tips),
    },
    unsupportedAdjustments,
    adjustmentSummary,
    message: matches
      ? null
      : `Reconciliation blocked: Shopify ${currency} total ${expectedTotal}, QuickBooks draft ${actualTotal} (difference ${absoluteDifference}).${unsupportedText}${
          adjustmentSummary ? ` Shopify adjustments: ${adjustmentSummary}.` : ""
        } SyncStock did not create a QuickBooks transaction.`,
  };
}
