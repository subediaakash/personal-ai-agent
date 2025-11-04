import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src";
import { eq, inArray } from "drizzle-orm";
import {
    plans as plansTable,
    planBlocks as planBlocksTable,
} from "@/drizzle/src/db/plan-schema";
import {
    task as taskTable,
    priority as taskPriorityEnum,
} from "@/drizzle/src/db/task-schema";

// Types for request validation
type Priority = "low" | "medium" | "high" | "urgent";
type CreatePlanRequest = {
    title: string;
    description?: string;
    is_template?: boolean;
    metadata?: Record<string, unknown>;
    blocks: Array<{
        title?: string; // if omitted, will fallback to task.title
        notes?: string;
        start_ts: string | Date;
        end_ts: string | Date;
        location?: string;
        order_index?: number;
        task?: {
            id?: string; // use an existing task
            title?: string; // or create a task inline
            description?: string;
            priority?: Priority;
            due_date?: string | Date;
            scheduled_start?: string | Date;
            scheduled_end?: string | Date;
            raw_input?: string;
            parser_confidence?: number;
            semantic_metadata?: Record<string, unknown>;
        };
    }>;
};

function toDate(value: string | Date | undefined): Date | undefined {
    if (value == null) return undefined;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return undefined;
    return d;
}

export async function GET() {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Fetch plans with blocks and tasks
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
            .where(eq(plansTable.user_id, session.user.id));

        // Group into nested structure
        const byPlan = new Map<
            string,
            {
                id: string;
                user_id: string;
                title: string;
                description: string | null;
                metadata: Record<string, unknown> | null;
                created_at: Date;
                updated_at: Date;
                is_template: boolean | null;
                blocks: Array<{
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
                    task?: typeof rows[number]["task"];
                }>;
            }
        >();

        for (const r of rows) {
            const p = r.plan;
            if (!byPlan.has(p.id)) {
                byPlan.set(p.id, {
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
                    blocks: [],
                });
            }
            if (r.block?.id) {
                byPlan.get(p.id)!.blocks.push({
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

        // Sort blocks by order_index for consistency
        const plans = Array.from(byPlan.values()).map((p) => ({
            ...p,
            blocks: p.blocks.sort(
                (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
            ),
        }));

        return NextResponse.json({ plans }, { status: 200 });
    } catch (error) {
        console.error("Error fetching user plans:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = (await req.json()) as CreatePlanRequest;

        // Basic validation
        if (!body?.title || typeof body.title !== "string") {
            return NextResponse.json(
                { error: "title is required" },
                { status: 400 }
            );
        }
        if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
            return NextResponse.json(
                { error: "blocks must be a non-empty array" },
                { status: 400 }
            );
        }

        // Validate blocks and dates early
        for (let i = 0; i < body.blocks.length; i++) {
            const b = body.blocks[i];
            const start = toDate(b.start_ts);
            const end = toDate(b.end_ts);
            if (!start || !end) {
                return NextResponse.json(
                    { error: `blocks[${i}]: start_ts and end_ts must be valid dates` },
                    { status: 400 }
                );
            }
            if (end.getTime() < start.getTime()) {
                return NextResponse.json(
                    { error: `blocks[${i}]: end_ts must be after start_ts` },
                    { status: 400 }
                );
            }
            if (b.task?.priority && !["low", "medium", "high", "urgent"].includes(b.task.priority)) {
                return NextResponse.json(
                    { error: `blocks[${i}].task.priority is invalid` },
                    { status: 400 }
                );
            }
        }

        const userId = session.user.id;

        const created = await db.transaction(async (tx) => {
            // 1) Create plan
            const [planRow] = await tx
                .insert(plansTable)
                .values({
                    user_id: userId,
                    title: body.title,
                    description: body.description ?? null,
                    is_template: body.is_template ?? false,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    metadata: (body.metadata as any) ?? {},
                })
                .returning();
            const planId = planRow.id;

            // 2) If some blocks reference existing tasks, validate ownership in batch
            const existingTaskIds = body.blocks
                .map((b) => b.task?.id)
                .filter((id): id is string => !!id);
            if (existingTaskIds.length > 0) {
                const owned = await tx
                    .select({ id: taskTable.id })
                    .from(taskTable)
                    .where(inArray(taskTable.id, existingTaskIds));
                const ownedSet = new Set(owned.map((r) => r.id));
                for (const tId of existingTaskIds) {
                    if (!ownedSet.has(tId)) {
                        throw new Error(`Task ${tId} not found or not owned by user`);
                    }
                }
            }

            // 3) Create tasks as needed and collect plan block rows
            const planBlockRows: Array<typeof planBlocksTable.$inferInsert> = [];

            for (let i = 0; i < body.blocks.length; i++) {
                const b = body.blocks[i];
                const start = toDate(b.start_ts)!;
                const end = toDate(b.end_ts)!;

                // Determine task_id
                let taskId: string | null = null;

                if (b.task?.id) {
                    taskId = b.task.id;
                } else if (b.task?.title) {
                    const [newTask] = await tx
                        .insert(taskTable)
                        .values({
                            user_id: userId,
                            title: b.task.title,
                            description: b.task.description ?? null,
                            priority: (b.task.priority ?? "medium") as typeof taskPriorityEnum.enumValues[number],
                            due_date: toDate(b.task.due_date),
                            scheduled_start: toDate(b.task.scheduled_start),
                            scheduled_end: toDate(b.task.scheduled_end),
                            raw_input: b.task.raw_input ?? null,
                            parser_confidence:
                                typeof b.task.parser_confidence === "number"
                                    ? Math.max(0, Math.min(100, b.task.parser_confidence))
                                    : 0,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            semantic_metadata: (b.task.semantic_metadata as any) ?? {},
                        })
                        .returning({ id: taskTable.id });
                    taskId = newTask.id;
                } else {
                    // block without task is allowed
                    taskId = null;
                }

                planBlockRows.push({
                    plan_id: planId,
                    task_id: taskId,
                    title: b.title ?? b.task?.title ?? "Untitled",
                    notes: b.notes ?? null,
                    start_ts: start,
                    end_ts: end,
                    location: b.location ?? null,
                    completed: false,
                    order_index: typeof b.order_index === "number" ? b.order_index : i,
                });
            }

            // 4) Insert plan blocks (bulk)
            await tx.insert(planBlocksTable).values(planBlockRows);

            // 5) Return nested result
            const rows = await tx
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
                .where(eq(plansTable.id, planId));

            // Shape nested
            const resultPlan = {
                id: planRow.id,
                user_id: planRow.user_id,
                title: planRow.title,
                description: planRow.description ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                metadata: (planRow.metadata as any) ?? null,
                created_at: planRow.created_at,
                updated_at: planRow.updated_at,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                is_template: (planRow as any).is_template ?? false,
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
                    task?: typeof rows[number]["task"];
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

            return resultPlan;
        });

        return NextResponse.json(created, { status: 201 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (
            typeof error?.message === "string" &&
            error.message.startsWith("Task ")
        ) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("Error creating plan:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}