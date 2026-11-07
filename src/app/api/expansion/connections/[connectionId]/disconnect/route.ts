import { expansionRoutes } from "@/lib/expansion/route-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await context.params;
  return expansionRoutes().disconnect(request, connectionId);
}
