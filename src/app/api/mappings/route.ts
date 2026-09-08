import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { z } from "zod";

const mappingSchema = z.object({
  shopifySku: z.string().min(1),
  shopifyTitle: z.string().optional(),
  qboItemId: z.string().min(1),
  qboItemName: z.string().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const mappings = await db.productMapping.findMany({ where: { userId: user.id } });
  return NextResponse.json({ mappings });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = mappingSchema.parse(await req.json());

  const mapping = await db.productMapping.upsert({
    where: { userId_shopifySku: { userId: user.id, shopifySku: body.shopifySku } },
    update: body,
    create: { ...body, userId: user.id },
  });

  return NextResponse.json({ mapping });
}
