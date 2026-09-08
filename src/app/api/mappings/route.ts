import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { z } from "zod";

const mappingSchema = z.object({
  shopifyVariantId: z.string().min(1),
  shopifySku: z.string().trim().nullable().optional(),
  shopifyTitle: z.string().trim().min(1).optional(),
  qboItemId: z.string().min(1),
  qboItemName: z.string().trim().min(1).optional(),
});

const mappingBatchSchema = z.object({
  mappings: z.array(mappingSchema).max(500),
  removeVariantIds: z.array(z.string().min(1)).max(500).default([]),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const mappings = await db.productMapping.findMany({
    where: { userId: user.id },
    orderBy: [{ shopifyTitle: "asc" }, { shopifySku: "asc" }],
  });
  return NextResponse.json({ mappings });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = mappingBatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid product mapping batch", details: parsed.error.flatten() }, { status: 400 });
  }

  const operations = [
    ...parsed.data.mappings.map((mapping) => {
      const normalized = { ...mapping, shopifySku: mapping.shopifySku?.trim() || null };
      return db.productMapping.upsert({
        where: {
          userId_shopifyVariantId: {
            userId: user.id,
            shopifyVariantId: normalized.shopifyVariantId,
          },
        },
        update: {
          shopifySku: normalized.shopifySku,
          shopifyTitle: normalized.shopifyTitle,
          qboItemId: normalized.qboItemId,
          qboItemName: normalized.qboItemName,
        },
        create: { ...normalized, userId: user.id },
      });
    }),
  ];

  if (parsed.data.removeVariantIds.length) {
    operations.push(
      db.productMapping.deleteMany({
        where: {
          userId: user.id,
          shopifyVariantId: { in: parsed.data.removeVariantIds },
        },
      }) as any
    );
  }

  if (operations.length) await db.$transaction(operations as any);

  const mappings = await db.productMapping.findMany({
    where: { userId: user.id },
    orderBy: [{ shopifyTitle: "asc" }, { shopifySku: "asc" }],
  });

  return NextResponse.json({ mappings });
}
