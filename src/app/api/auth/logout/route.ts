import { NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const options = sessionCookieOptions();
  res.cookies.set({ ...options, value: "", maxAge: 0 });
  return res;
}
