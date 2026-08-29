import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recommend } from "@/server/llm-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  genre: z.string().optional(),
  count: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const suggestions = await recommend({ ...parsed.data, count: parsed.data.count ?? 2 });
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "llm_failed" },
      { status: 502 }
    );
  }
}
