import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getQboClientForUser, listQboItems } from "@/lib/qbo";

const optionalItemId = z.string().trim().min(1).nullable().optional();
const schema = z.object({
  shippingQboItemId: optionalItemId,
  tipsQboItemId: optionalItemId,
  dutiesQboItemId: optionalItemId,
  additionalFeeQboItemId: optionalItemId,
});

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const settings = await db.accountingSettings.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    settings: settings ?? {
      shippingQboItemId: null,
      shippingQboItemName: null,
      tipsQboItemId: null,
      tipsQboItemName: null,
      dutiesQboItemId: null,
      dutiesQboItemName: null,
      additionalFeeQboItemId: null,
      additionalFeeQboItemName: null,
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid accounting settings" }, { status: 400 });

  const qboConnection = await db.qboConnection.findUnique({ where: { userId: user.id } });
  if (!qboConnection) return NextResponse.json({ error: "Connect QuickBooks before configuring accounting settings." }, { status: 409 });

  try {
    const qbo = await getQboClientForUser(user.id);
    const items = await listQboItems(qbo);
    const itemById = new Map(items.map((item) => [item.id, item] as const));

    const fields = [
      ["shippingQboItemId", "shippingQboItemName"],
      ["tipsQboItemId", "tipsQboItemName"],
      ["dutiesQboItemId", "dutiesQboItemName"],
      ["additionalFeeQboItemId", "additionalFeeQboItemName"],
    ] as const;

    const data: Record<string, string | null> = {};
    for (const [idField, nameField] of fields) {
      const id = parsed.data[idField] ?? null;
      if (!id) {
        data[idField] = null;
        data[nameField] = null;
        continue;
      }
      const item = itemById.get(id);
      if (!item) {
        return NextResponse.json({ error: `QuickBooks item ${id} is not available or active.` }, { status: 400 });
      }
      data[idField] = item.id;
      data[nameField] = item.name;
    }

    const settings = await db.accountingSettings.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...(data as any) },
    });

    return NextResponse.json({ settings });
  } catch (error: any) {
    const message = error?.Fault?.Error?.[0]?.Message || error?.message || "Could not save accounting settings";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
