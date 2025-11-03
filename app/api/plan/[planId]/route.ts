import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src";
import { and, eq } from "drizzle-orm";
import {
    plans as plansTable,
    planBlocks as planBlocksTable,
} from "@/drizzle/src/db/plan-schema";
import { task as taskTable } from "@/drizzle/src/db/task-schema";

const UUID_RE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export async function GET(
    req: NextRequest,
    { params }: { params: { planId: string } }
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const planId = params.planId;
        if (!UUID_RE.test(planId)) {
            return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
        }

        // Fetch the plan with its blocks and tasks, ensuring ownership
        const rows = await db
            .select({
                plan: plansTable,
                block: planBlocksTable,
                task: taskTable,
            })
            .from(plansTable)
            .leftJoin(
                planBlocksTable,
                eq(planBlocksTable.plan_id, plansTable.id)
            )
            .leftJoin(taskTable, eq(planBlocksTable.task_id, taskTable.id))
            .where(
                and(eq(plansTable.id, planId), eq(plansTable.user_id, session.user.id))
            );

        if (rows.length === 0) {
            return NextResponse.json({ error: "Plan not found" }, { status: 404 });
        }

        // Base plan (same for all rows)
        const p = rows[0].plan;
        const resultPlan = {
            id: p.id,
            user_id: p.user_id,
            title: p.title,
            description: p.description ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata: (p.metadata as any) ?? null,
            created_at: p.created_at,
            updated_at: p.updated_at,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            is_template: (p as any).is_template ?? false,
            blocks: [] as Array<{
                id: string;
                plan_id: string;
                task_id: string | null;
                title: string;
                notes: string | null;
                start_ts: Date;
                end_ts: Date;
                location: string | null;
                completed: boolean | null;
                order_index: number | null;
                created_at: Date;
                task?: (typeof rows)[number]["task"];
            }>,
        };

        for (const r of rows) {
            if (r.block?.id) {
                resultPlan.blocks.push({
                    id: r.block.id,
                    plan_id: r.block.plan_id,
                    task_id: r.block.task_id ?? null,
                    title: r.block.title,
                    notes: r.block.notes ?? null,
                    start_ts: r.block.start_ts,
                    end_ts: r.block.end_ts,
                    location: r.block.location ?? null,
                    completed: r.block.completed ?? false,
                    order_index: r.block.order_index ?? 0,
                    created_at: r.block.created_at,
                    task: r.task ?? undefined,
                });
            }
        }

        resultPlan.blocks.sort(
            (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        );

        return NextResponse.json({ plan: resultPlan }, { status: 200 });
    } catch (err) {
        console.error("Error fetching plan:", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { planId: string } }
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const planId = params.planId;
        if (!UUID_RE.test(planId)) {
            return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
        }

        const deleteCount = await db
            .delete(plansTable)
            .where(
                and(eq(plansTable.id, planId), eq(plansTable.user_id, session.user.id))
            )
            .returning();

        if (deleteCount.length === 0) {
            return NextResponse.json({ error: "Plan not found or could not be deleted" }, { status: 404 });
        }

        return NextResponse.json({ message: "Plan deleted successfully" }, { status: 200 });
    } catch (err) {
        console.error("Error deleting plan:", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { planId: string } }
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const planId = params.planId;
        if (!UUID_RE.test(planId)) {
            return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
        }

        const body = await req.json();
        const updateData = {
            title: body.title,
            description: body.description,
            metadata: body.metadata,
            updated_at: new Date(),
        };

        const updateCount = await db
            .update(plansTable)
            .set(updateData)
            .where(
                and(eq(plansTable.id, planId), eq(plansTable.user_id, session.user.id))
            )
            .returning();

        if (updateCount.length === 0) {
            return NextResponse.json({ error: "Plan not found or could not be updated" }, { status: 404 });
        }

        return NextResponse.json({ message: "Plan updated successfully" }, { status: 200 });
    } catch (err) {
        console.error("Error updating plan:", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}