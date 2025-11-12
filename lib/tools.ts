import { tool } from "ai";
import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src";
import { task as taskTable } from "@/drizzle/src/db/task-schema";
import {
    planBlocks as planBlocksTable,
    plans as plansTable,
} from "@/drizzle/src/db/plan-schema";
import { and, eq } from "drizzle-orm";

export const aiTools = {
    createTask: tool({
        description: "Create a new task for the current user.",
        inputSchema: z.object({
            title: z.string().min(1),
            description: z.string().nullable().optional(),
            priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
            status: z.enum(["pending", "completed", "snoozed", "cancelled"])
                .optional(),
            dueDate: z.string().datetime({ offset: true }).nullable()
                .optional(),
            scheduledStart: z.string().datetime({ offset: true }).nullable()
                .optional(),
            scheduledEnd: z.string().datetime({ offset: true }).nullable()
                .optional(),
            rawInput: z.string().nullable().optional(),
            parserConfidence: z.number().int().min(0).max(100).optional(),
            semanticMetadata: z.record(z.string(), z.any()).nullable()
                .optional(),
        }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) {
                throw new Error("Unauthorized");
            }
            const [inserted] = await db
                .insert(taskTable)
                .values({
                    user_id: session.user.id,
                    title: input.title,
                    description: input.description,
                    priority: input.priority,
                    status: input.status,
                    due_date: input.dueDate
                        ? new Date(input.dueDate)
                        : undefined,
                    scheduled_start: input.scheduledStart
                        ? new Date(input.scheduledStart)
                        : undefined,
                    scheduled_end: input.scheduledEnd
                        ? new Date(input.scheduledEnd)
                        : undefined,
                    raw_input: input.rawInput,
                    parser_confidence: input.parserConfidence,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    semantic_metadata: (input.semanticMetadata as any) ?? {},
                })
                .returning({
                    id: taskTable.id,
                    title: taskTable.title,
                    description: taskTable.description,
                    priority: taskTable.priority,
                    status: taskTable.status,
                });
            return { ok: true, task: inserted };
        },
    }),

    updateTask: tool({
        description: "Update a task by id for the current user.",
        inputSchema: z.object({
            taskId: z.string().uuid(),
            title: z.string().optional(),
            description: z.string().nullable().optional(),
            priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
            status: z.enum(["pending", "completed", "snoozed", "cancelled"])
                .optional(),
            dueDate: z.string().datetime({ offset: true }).nullable()
                .optional(),
            scheduledStart: z.string().datetime({ offset: true }).nullable()
                .optional(),
            scheduledEnd: z.string().datetime({ offset: true }).nullable()
                .optional(),
            rawInput: z.string().nullable().optional(),
            parserConfidence: z.number().int().min(0).max(100).optional(),
            semanticMetadata: z.record(z.string(), z.any()).nullable()
                .optional(),
        }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            const values: Record<string, unknown> = {};
            if (input.title !== undefined) values.title = input.title;
            if (input.description !== undefined) {
                values.description = input.description;
            }
            if (input.priority !== undefined) values.priority = input.priority;
            if (input.status !== undefined) values.status = input.status;
            if (input.dueDate !== undefined) {
                values.due_date = input.dueDate === null
                    ? null
                    : new Date(input.dueDate);
            }
            if (input.scheduledStart !== undefined) {
                values.scheduled_start = input.scheduledStart === null
                    ? null
                    : new Date(input.scheduledStart);
            }
            if (input.scheduledEnd !== undefined) {
                values.scheduled_end = input.scheduledEnd === null
                    ? null
                    : new Date(input.scheduledEnd);
            }
            if (input.rawInput !== undefined) values.raw_input = input.rawInput;
            if (input.parserConfidence !== undefined) {
                values.parser_confidence = Math.max(
                    0,
                    Math.min(100, input.parserConfidence),
                );
            }
            if (input.semanticMetadata !== undefined) {
                values.semantic_metadata = input.semanticMetadata;
            }

            const result = await db
                .update(taskTable)
                .set(values)
                .where(
                    and(
                        eq(taskTable.id, input.taskId),
                        eq(taskTable.user_id, session.user.id),
                    ),
                );
            if (result.rowCount === 0) throw new Error("Task not found");
            return { ok: true };
        },
    }),

    deleteTask: tool({
        description: "Soft-delete a task by id (sets deleted=true).",
        inputSchema: z.object({ taskId: z.string().uuid() }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            const result = await db
                .update(taskTable)
                .set({ deleted: true })
                .where(
                    and(
                        eq(taskTable.id, input.taskId),
                        eq(taskTable.user_id, session.user.id),
                    ),
                );
            if (result.rowCount === 0) throw new Error("Task not found");
            return { ok: true };
        },
    }),

    listTasks: tool({
        description: "List tasks for the current user (excludes deleted).",
        inputSchema: z.object({
            limit: z.number().int().min(1).max(100).default(20),
        }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            const rows = await db
                .select({
                    id: taskTable.id,
                    title: taskTable.title,
                    description: taskTable.description,
                    status: taskTable.status,
                    priority: taskTable.priority,
                })
                .from(taskTable)
                .where(
                    and(
                        eq(taskTable.user_id, session.user.id),
                        eq(taskTable.deleted, false),
                    ),
                )
                .limit(input.limit);
            return { ok: true, tasks: rows };
        },
    }),

    createPlan: tool({
        description:
            "Create a plan with time blocks; optionally create or link tasks.",
        inputSchema: z.object({
            title: z.string().min(1),
            description: z.string().nullable().optional(),
            isTemplate: z.boolean().optional(),
            metadata: z.record(z.string(), z.any()).optional(),
            blocks: z.array(
                z.object({
                    title: z.string().optional(),
                    notes: z.string().nullable().optional(),
                    startTs: z.string().datetime({ offset: true }),
                    endTs: z.string().datetime({ offset: true }),
                    location: z.string().optional(),
                    orderIndex: z.number().int().optional(),
                    task: z
                        .object({
                            id: z.string().uuid().optional(),
                            title: z.string().optional(),
                            description: z.string().nullable().optional(),
                            priority: z.enum([
                                "low",
                                "medium",
                                "high",
                                "urgent",
                            ]).optional(),
                            dueDate: z.string().datetime({ offset: true })
                                .nullable().optional(),
                            scheduledStart: z.string().datetime({
                                offset: true,
                            }).nullable().optional(),
                            scheduledEnd: z.string().datetime({ offset: true })
                                .nullable().optional(),
                            rawInput: z.string().nullable().optional(),
                            parserConfidence: z.number().int().min(0).max(100)
                                .optional(),
                            semanticMetadata: z.record(z.string(), z.any())
                                .nullable().optional(),
                        })
                        .optional(),
                }),
            ),
        }),
        execute: async (input) => {
            // reuse the HTTP API to ensure identical behavior? We'll write directly for performance.
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");

            const userId = session.user.id;
            const created = await db.transaction(async (tx) => {
                const [planRow] = await tx
                    .insert(plansTable)
                    .values({
                        user_id: userId,
                        title: input.title,
                        description: input.description ?? null,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        metadata: (input.metadata as any) ?? {},
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        is_template: (input as any).isTemplate ?? false,
                    })
                    .returning();

                const planId = planRow.id;
                const blockRows: Array<typeof planBlocksTable.$inferInsert> =
                    [];
                for (let i = 0; i < input.blocks.length; i++) {
                    const b = input.blocks[i];
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
                                priority: b.task.priority,
                                due_date: b.task.dueDate
                                    ? new Date(b.task.dueDate)
                                    : undefined,
                                scheduled_start: b.task.scheduledStart
                                    ? new Date(b.task.scheduledStart)
                                    : undefined,
                                scheduled_end: b.task.scheduledEnd
                                    ? new Date(b.task.scheduledEnd)
                                    : undefined,
                                raw_input: b.task.rawInput ?? null,
                                parser_confidence:
                                    typeof b.task.parserConfidence === "number"
                                        ? Math.max(
                                            0,
                                            Math.min(
                                                100,
                                                b.task.parserConfidence,
                                            ),
                                        )
                                        : 0,
                                semantic_metadata:
                                    (b.task.semanticMetadata as unknown) ?? {},
                            })
                            .returning({ id: taskTable.id });
                        taskId = newTask.id;
                    }

                    blockRows.push({
                        plan_id: planId,
                        task_id: taskId,
                        title: b.title ?? b.task?.title ?? "Untitled",
                        notes: b.notes ?? null,
                        start_ts: new Date(b.startTs),
                        end_ts: new Date(b.endTs),
                        location: b.location ?? null,
                        completed: false,
                        order_index: b.orderIndex ?? i,
                    });
                }

                await tx.insert(planBlocksTable).values(blockRows);
                return { id: planId, title: planRow.title };
            });
            return { ok: true, plan: created };
        },
    }),

    updatePlan: tool({
        description: "Update top-level plan fields (not blocks).",
        inputSchema: z.object({
            planId: z.string().uuid(),
            title: z.string().optional(),
            description: z.string().nullable().optional(),
            metadata: z.record(z.string(), z.any()).nullable().optional(),
        }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            const values: Record<string, unknown> = {};
            if (input.title !== undefined) values.title = input.title;
            if (input.description !== undefined) {
                values.description = input.description;
            }
            if (input.metadata !== undefined) values.metadata = input.metadata;
            values.updated_at = new Date();

            const result = await db
                .update(plansTable)
                .set(values)
                .where(
                    and(
                        eq(plansTable.id, input.planId),
                        eq(plansTable.user_id, session.user.id),
                    ),
                );
            if (result.rowCount === 0) throw new Error("Plan not found");
            return { ok: true };
        },
    }),

    deletePlan: tool({
        description: "Delete a plan and its blocks.",
        inputSchema: z.object({ planId: z.string().uuid() }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            const deleted = await db
                .delete(plansTable)
                .where(
                    and(
                        eq(plansTable.id, input.planId),
                        eq(plansTable.user_id, session.user.id),
                    ),
                )
                .returning({ id: plansTable.id });
            if (deleted.length === 0) throw new Error("Plan not found");
            return { ok: true };
        },
    }),

    addPlanBlock: tool({
        description: "Add a time block to an existing plan.",
        inputSchema: z.object({
            planId: z.string().uuid(),
            title: z.string().optional(),
            notes: z.string().nullable().optional(),
            startTs: z.string().datetime({ offset: true }),
            endTs: z.string().datetime({ offset: true }),
            location: z.string().optional(),
            orderIndex: z.number().int().optional(),
            task: z
                .object({
                    id: z.string().uuid().optional(),
                    title: z.string().optional(),
                    description: z.string().nullable().optional(),
                    priority: z.enum(["low", "medium", "high", "urgent"])
                        .optional(),
                    dueDate: z.string().datetime({ offset: true }).nullable()
                        .optional(),
                    scheduledStart: z.string().datetime({ offset: true })
                        .nullable().optional(),
                    scheduledEnd: z.string().datetime({ offset: true })
                        .nullable().optional(),
                    rawInput: z.string().nullable().optional(),
                    parserConfidence: z.number().int().min(0).max(100)
                        .optional(),
                    semanticMetadata: z.record(z.string(), z.any()).nullable()
                        .optional(),
                })
                .optional(),
        }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            const ownedPlan = await db
                .select({ id: plansTable.id })
                .from(plansTable)
                .where(
                    and(
                        eq(plansTable.id, input.planId),
                        eq(plansTable.user_id, session.user.id),
                    ),
                );
            if (ownedPlan.length === 0) throw new Error("Plan not found");
            let taskId: string | null = null;
            const t = input.task;
            if (t?.id) {
                taskId = t.id;
            } else if (t?.title) {
                const [newTask] = await db
                    .insert(taskTable)
                    .values({
                        user_id: session.user.id,
                        title: t.title,
                        description: t.description ?? null,
                        priority: t.priority,
                        due_date: t.dueDate ? new Date(t.dueDate) : undefined,
                        scheduled_start: t.scheduledStart
                            ? new Date(t.scheduledStart)
                            : undefined,
                        scheduled_end: t.scheduledEnd
                            ? new Date(t.scheduledEnd)
                            : undefined,
                        raw_input: t.rawInput ?? null,
                        parser_confidence:
                            typeof t.parserConfidence === "number"
                                ? Math.max(0, Math.min(100, t.parserConfidence))
                                : 0,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        semantic_metadata: (t.semanticMetadata as any) ?? {},
                    })
                    .returning({ id: taskTable.id });
                taskId = newTask.id;
            }
            const [block] = await db
                .insert(planBlocksTable)
                .values({
                    plan_id: input.planId,
                    task_id: taskId,
                    title: input.title ?? t?.title ?? "Untitled",
                    notes: input.notes ?? null,
                    start_ts: new Date(input.startTs),
                    end_ts: new Date(input.endTs),
                    location: input.location ?? null,
                    completed: false,
                    order_index: input.orderIndex ?? 0,
                })
                .returning({
                    id: planBlocksTable.id,
                    title: planBlocksTable.title,
                });
            return { ok: true, block };
        },
    }),

    updatePlanBlock: tool({
        description: "Update a single plan block.",
        inputSchema: z.object({
            planId: z.string().uuid(),
            blockId: z.string().uuid(),
            title: z.string().optional(),
            notes: z.string().nullable().optional(),
            startTs: z.string().datetime({ offset: true }).nullable()
                .optional(),
            endTs: z.string().datetime({ offset: true }).nullable().optional(),
            location: z.string().nullable().optional(),
            completed: z.boolean().optional(),
            orderIndex: z.number().int().optional(),
            taskId: z.string().uuid().nullable().optional(),
        }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            // ensure ownership
            const owned = await db
                .select({ id: plansTable.id })
                .from(plansTable)
                .where(
                    and(
                        eq(plansTable.id, input.planId),
                        eq(plansTable.user_id, session.user.id),
                    ),
                );
            if (owned.length === 0) throw new Error("Plan not found");
            const values: Record<string, unknown> = {};
            if (input.title !== undefined) values.title = input.title;
            if (input.notes !== undefined) values.notes = input.notes;
            if (input.startTs !== undefined) {
                values.start_ts = input.startTs === null
                    ? null
                    : new Date(input.startTs);
            }
            if (input.endTs !== undefined) {
                values.end_ts = input.endTs === null
                    ? null
                    : new Date(input.endTs);
            }
            if (input.location !== undefined) values.location = input.location;
            if (input.completed !== undefined) {
                values.completed = input.completed;
            }
            if (input.orderIndex !== undefined) {
                values.order_index = input.orderIndex;
            }
            if (input.taskId !== undefined) values.task_id = input.taskId;

            const updated = await db
                .update(planBlocksTable)
                .set(values)
                .where(
                    and(
                        eq(planBlocksTable.id, input.blockId),
                        eq(planBlocksTable.plan_id, input.planId),
                    ),
                );
            if (updated.rowCount === 0) throw new Error("Block not found");
            return { ok: true };
        },
    }),

    deletePlanBlock: tool({
        description: "Delete a single plan block.",
        inputSchema: z.object({
            planId: z.string().uuid(),
            blockId: z.string().uuid(),
        }),
        execute: async (input) => {
            const h = await headers();
            const session = await auth.api.getSession({ headers: h });
            if (!session?.user?.id) throw new Error("Unauthorized");
            // ensure ownership
            const owned = await db
                .select({ id: plansTable.id })
                .from(plansTable)
                .where(
                    and(
                        eq(plansTable.id, input.planId),
                        eq(plansTable.user_id, session.user.id),
                    ),
                );
            if (owned.length === 0) throw new Error("Plan not found");
            const deleted = await db
                .delete(planBlocksTable)
                .where(
                    and(
                        eq(planBlocksTable.id, input.blockId),
                        eq(planBlocksTable.plan_id, input.planId),
                    ),
                );
            if (deleted.rowCount === 0) throw new Error("Block not found");
            return { ok: true };
        },
    }),
};
