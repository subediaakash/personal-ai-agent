import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src";
import { plans, planBlocks } from "@/drizzle/src/db/plan-schema";
import { and, desc, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const rows = await db
    .select({
      plan: plans,
      block: planBlocks,
    })
    .from(plans)
    .leftJoin(planBlocks, eq(planBlocks.plan_id, plans.id))
    .where(eq(plans.user_id, session.user.id))
    .orderBy(desc(plans.created_at));

  const summary = new Map<
    string,
    {
      id: string;
      title: string;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      isTemplate: boolean | null;
      blocks: number;
    }
  >();

  for (const r of rows) {
    const p = r.plan;
    if (!summary.has(p.id)) {
      summary.set(p.id, {
        id: p.id,
        title: p.title,
        description: p.description ?? null,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isTemplate: (p as any).is_template ?? false,
        blocks: 0,
      });
    }
    if (r.block?.id) {
      summary.get(p.id)!.blocks += 1;
    }
  }

  const items = Array.from(summary.values());

  return (
    <div className="container mx-auto max-w-3xl py-8 space-y-6">
      <h1 className="text-2xl font-semibold">My Plans</h1>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">No plans yet.</div>
      ) : (
        <div className="grid gap-4">
          {items.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{p.title}</span>
                  {p.isTemplate ? (
                    <span className="text-xs rounded-md border px-2 py-0.5">Template</span>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  <span className="mr-3">Blocks: {p.blocks}</span>
                  <span>Created: {new Date(p.createdAt).toLocaleString()}</span>
                </CardDescription>
              </CardHeader>
              {p.description ? (
                <CardContent>
                  <p className="text-sm">{p.description}</p>
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


