import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src/index";
import { task } from "@/drizzle/src/db/task-schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Add a body schema (camelCase in API, snake_case in DB)
const createTaskSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    status: z.enum(["pending", "completed", "snoozed", "cancelled"]).optional(),
    dueDate: z.coerce.date().optional(),
    scheduledStart: z.coerce.date().optional(),
    scheduledEnd: z.coerce.date().optional(),
    rawInput: z.string().optional(),
    // integer in schema; clamp 0..100
    parserConfidence: z.number().int().min(0).max(100).optional(),
    semanticMetadata: z.record(z.string(), z.any()).optional(),
})
    .refine(
        (v) =>
            !v.scheduledStart || !v.scheduledEnd ||
            v.scheduledEnd > v.scheduledStart,
        {
            message: "scheduledEnd must be after scheduledStart",
            path: ["scheduledEnd"],
        },
    );

export async function GET(req: Request) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, Number(searchParams.get("page") || "1"));
        const limit = Math.min(
            100,
            Math.max(1, Number(searchParams.get("limit") || "20")),
        );
        const sortBy = (searchParams.get("sortBy") || "id") as "id" | "name";
        const sortOrder = (searchParams.get("sortOrder") || "desc") as
            | "asc"
            | "desc";

        // Map allowed sort fields to actual columns
        const SORT_FIELDS = {
            id: task.id,
            name: task.title,
        } as const;
        const sortColumn = SORT_FIELDS[sortBy] ?? task.id;
        const orderBy = sortOrder === "asc"
            ? asc(sortColumn)
            : desc(sortColumn);

        const offset = (page - 1) * limit;

        // Fetch limit+1 to compute hasNextPage without a COUNT(*)
        const rows = await db
            .select({
                id: task.id,
                name: task.title,
                description: task.description,
            })
            .from(task)
            .where(
                and(
                    eq(task.user_id, session.user.id),
                    eq(task.deleted, false),
                ),
            )
            .orderBy(orderBy)
            .limit(limit + 1)
            .offset(offset);

        const hasNextPage = rows.length > limit;
        const data = hasNextPage ? rows.slice(0, limit) : rows;

        return NextResponse.json(
            {
                data,
                meta: { page, limit, hasNextPage },
            },
            {
                status: 200,
                headers: {
                    "Cache-Control":
                        "private, no-store, no-cache, must-revalidate",
                },
            },
        );
    } catch (error) {
        console.error("GET /api/tasks error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}

export async function POST(req: Request) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const body = await req.json();
        const parsed = createTaskSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid request", details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const v = parsed.data;

        const inserted = await db
            .insert(task)
            .values({
                user_id: session.user.id,
                title: v.title,
                description: v.description,
                priority: v.priority,
                status: v.status,
                due_date: v.dueDate,
                scheduled_start: v.scheduledStart,
                scheduled_end: v.scheduledEnd,
                raw_input: v.rawInput,
                parser_confidence: v.parserConfidence,
                semantic_metadata: v.semanticMetadata ?? {},
            })
            .returning({
                id: task.id,
                title: task.title,
                description: task.description,
                priority: task.priority,
                status: task.status,
                due_date: task.due_date,
                scheduled_start: task.scheduled_start,
                scheduled_end: task.scheduled_end,
                raw_input: task.raw_input,
                parser_confidence: task.parser_confidence,
                semantic_metadata: task.semantic_metadata,
                created_at: task.created_at,
                updated_at: task.updated_at,
            });

        return NextResponse.json({ data: inserted[0] }, { status: 201 });
    } catch (error) {
        console.error("POST /api/tasks error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}
