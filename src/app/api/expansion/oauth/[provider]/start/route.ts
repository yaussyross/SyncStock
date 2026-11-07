import { expansionRoutes } from "@/lib/expansion/route-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  return expansionRoutes().start(request, provider);
}
