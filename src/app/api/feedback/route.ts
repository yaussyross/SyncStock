import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const feedbackSchema = z.object({
  category: z.enum(["feedback", "bug", "feature", "onboarding", "billing"]).default("feedback"),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  message: z.string().trim().min(3).max(2000),
  page: z.string().trim().max(200).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to send feedback." }, { status: 401 });

  const origin = req.headers.get("origin");
  const appUrl = process.env.APP_URL;
  if (origin && appUrl && origin !== new URL(appUrl).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Add a short message (up to 2,000 characters)." }, { status: 400 });
  }

  await db.feedback.create({
    data: {
      userId: user.id,
      category: parsed.data.category,
      rating: parsed.data.rating ?? null,
      message: parsed.data.message,
      page: parsed.data.page ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
