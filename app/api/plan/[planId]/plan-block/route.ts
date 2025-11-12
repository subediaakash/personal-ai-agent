import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src";
import { planBlocks, plans } from "@/drizzle/src/db/plan-schema";
import {
    priority as taskPriorityEnum,
    task as taskTable,
} from "@/drizzle/src/db/task-schema";
import { and, eq } from "drizzle-orm";

type Priority = "low" | "medium" | "high" | "urgent";

function toDate(value: string | Date | undefined): Date | undefined {
    if (value == null) return undefined;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return undefined;
    return d;
}

export async function POST(
    req: NextRequest,
    { params }: { params: { planId: string } },
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }
        const planId = params.planId;

        const body = await req.json();
        const startTs = body.startTs ?? body.start_ts;
        const endTs = body.endTs ?? body.end_ts;

        const start = toDate(startTs);
        const end = toDate(endTs);
        if (!start || !end) {
            return NextResponse.json(
                {
                    error:
                        "startTs and endTs are required and must be valid dates",
                },
                { status: 400 },
            );
        }
        if (end.getTime() < start.getTime()) {
            return NextResponse.json(
                { error: "endTs must be after startTs" },
                { status: 400 },
            );
        }

        // Ensure user owns the plan
        const ownedPlan = await db
            .select({ id: plans.id })
            .from(plans)
            .where(
                and(eq(plans.id, planId), eq(plans.user_id, session.user.id)),
            );
        if (ownedPlan.length === 0) {
            return NextResponse.json({ error: "Plan not found" }, {
                status: 404,
            });
        }

        // Optional task linking/creation
        let taskId: string | null = null;
        const t = body.task as
            | {
                id?: string;
                title?: string;
                description?: string;
                priority?: Priority;
                dueDate?: string | Date;
                scheduledStart?: string | Date;
                scheduledEnd?: string | Date;
                rawInput?: string;
                parserConfidence?: number;
                semanticMetadata?: Record<string, unknown>;
            }
            | undefined;
        if (t?.id) {
            taskId = t.id;
        } else if (t?.title) {
            const [newTask] = await db
                .insert(taskTable)
                .values({
                    user_id: session.user.id,
                    title: t.title,
                    description: t.description ?? null,
                    priority: (t.priority ??
                        "medium") as (typeof taskPriorityEnum.enumValues)[
                            number
                        ],
                    due_date: toDate(t.dueDate),
                    scheduled_start: toDate(t.scheduledStart),
                    scheduled_end: toDate(t.scheduledEnd),
                    raw_input: t.rawInput ?? null,
                    parser_confidence: typeof t.parserConfidence === "number"
                        ? Math.max(0, Math.min(100, t.parserConfidence))
                        : 0,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    semantic_metadata: (t.semanticMetadata as any) ?? {},
                })
                .returning({ id: taskTable.id });
            taskId = newTask.id;
        }

        const [inserted] = await db
            .insert(planBlocks)
            .values({
                plan_id: planId,
                task_id: taskId,
                title: body.title ?? t?.title ?? "Untitled",
                notes: body.notes ?? null,
                start_ts: start,
                end_ts: end,
                location: body.location ?? null,
                completed: false,
                order_index: typeof body.orderIndex === "number"
                    ? body.orderIndex
                    : 0,
            })
            .returning();

        return NextResponse.json({ block: inserted }, { status: 201 });
    } catch (error) {
        console.error("Error creating plan block:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}
