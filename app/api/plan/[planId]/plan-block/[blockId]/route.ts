import { db } from "@/drizzle/src";
import { planBlocks, plans } from "@/drizzle/src/db/plan-schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

function mapUpdateBody(input: Record<string, unknown>) {
    const update: Record<string, unknown> = {};
    if (typeof input.title === "string") update.title = input.title;
    if (typeof input.notes === "string" || input.notes === null) {
        update.notes = input.notes;
    }
    const start = input.startTs ?? input.start_ts;
    const end = input.endTs ?? input.end_ts;
    if (start) update.start_ts = new Date(start as string);
    if (end) update.end_ts = new Date(end as string);
    if (typeof input.location === "string" || input.location === null) {
        update.location = input.location;
    }
    if (typeof input.completed === "boolean") {
        update.completed = input.completed;
    }
    if (typeof input.orderIndex === "number") {
        update.order_index = input.orderIndex;
    }
    if (typeof input.taskId === "string" || input.taskId === null) {
        update.task_id = input.taskId;
    }
    return update;
}

export async function GET(
    req: Request,
    { params }: { params: { planId: string; blockId: string } },
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { planId, blockId } = params;

        const rows = await db
            .select({ block: planBlocks })
            .from(planBlocks)
            .innerJoin(plans, eq(plans.id, planBlocks.plan_id))
            .where(
                and(
                    eq(planBlocks.id, blockId),
                    eq(planBlocks.plan_id, planId),
                    eq(plans.user_id, session.user.id),
                ),
            );

        if (rows.length === 0) {
            return NextResponse.json({ error: "Block not found" }, {
                status: 404,
            });
        }

        return NextResponse.json({ block: rows[0].block }, { status: 200 });
    } catch (error) {
        console.error("Error fetching plan block:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { planId: string; blockId: string } },
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { planId, blockId } = params;

        // Ensure ownership by constraining via subquery on plans.user_id
        const owned = await db
            .select({ id: planBlocks.id })
            .from(planBlocks)
            .innerJoin(plans, eq(plans.id, planBlocks.plan_id))
            .where(
                and(
                    eq(planBlocks.id, blockId),
                    eq(planBlocks.plan_id, planId),
                    eq(plans.user_id, session.user.id),
                ),
            );

        if (owned.length === 0) {
            return NextResponse.json({ error: "Block not found" }, {
                status: 404,
            });
        }

        const deleted = await db
            .delete(planBlocks)
            .where(
                and(eq(planBlocks.id, blockId), eq(planBlocks.plan_id, planId)),
            )
            .returning({ id: planBlocks.id });

        if (deleted.length === 0) {
            return NextResponse.json(
                { error: "Block not found or could not be deleted" },
                { status: 404 },
            );
        }

        return NextResponse.json({ message: "Block deleted successfully" }, {
            status: 200,
        });
    } catch (error) {
        console.error("Error deleting plan block:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { planId: string; blockId: string } },
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { planId, blockId } = params;
        const raw = await req.json();
        const body = mapUpdateBody(raw);

        // Ensure ownership by constraining via join
        const owned = await db
            .select({ id: planBlocks.id })
            .from(planBlocks)
            .innerJoin(plans, eq(plans.id, planBlocks.plan_id))
            .where(
                and(
                    eq(planBlocks.id, blockId),
                    eq(planBlocks.plan_id, planId),
                    eq(plans.user_id, session.user.id),
                ),
            );
        if (owned.length === 0) {
            return NextResponse.json(
                { error: "Block not found or not owned by user" },
                { status: 404 },
            );
        }

        const updated = await db
            .update(planBlocks)
            .set(body)
            .where(
                and(eq(planBlocks.id, blockId), eq(planBlocks.plan_id, planId)),
            )
            .returning();

        if (updated.length === 0) {
            return NextResponse.json(
                { error: "Block not found or could not be updated" },
                { status: 404 },
            );
        }

        return NextResponse.json({ block: updated[0] }, { status: 200 });
    } catch (error) {
        console.error("Error updating plan block:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}
