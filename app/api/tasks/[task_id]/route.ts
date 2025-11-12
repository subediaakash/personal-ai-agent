import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src/index";
import { task } from "@/drizzle/src/db/task-schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    context: { params: { task_id: string } },
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const taskId = context.params.task_id;

        const taskItem = await db
            .select()
            .from(task)
            .where(
                and(
                    eq(task.id, taskId),
                    eq(task.user_id, session.user.id),
                    eq(task.deleted, false),
                ),
            )
            .limit(1);

        if (!taskItem.length) {
            return NextResponse.json({ error: "Task not found" }, {
                status: 404,
            });
        }

        return NextResponse.json(taskItem[0]);
    } catch (error) {
        console.error("Error in GET /api/tasks:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}

export async function DELETE(
    req: Request,
    context: { params: { task_id: string } },
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const taskId = context.params.task_id;

        const deleteResult = await db
            .update(task)
            .set({ deleted: true })
            .where(
                and(
                    eq(task.id, taskId),
                    eq(task.user_id, session.user.id),
                ),
            );

        if (deleteResult.rowCount === 0) {
            return NextResponse.json({
                error: "Task not found or could not be deleted",
            }, { status: 404 });
        }

        return NextResponse.json({ message: "Task deleted successfully" });
    } catch (error) {
        console.error("Error in DELETE /api/tasks:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}

export async function PATCH(
    req: Request,
    context: { params: { task_id: string } },
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, {
                status: 401,
            });
        }

        const taskId = context.params.task_id;
        const input = await req.json();
        const body: Record<string, unknown> = {};
        if (typeof input.title === "string") body.title = input.title;
        if (
            typeof input.description === "string" || input.description === null
        ) {
            body.description = input.description;
        }
        if (typeof input.priority === "string") body.priority = input.priority;
        if (typeof input.status === "string") body.status = input.status;
        if (input.dueDate) body.due_date = new Date(input.dueDate);
        if (input.scheduledStart) {
            body.scheduled_start = new Date(input.scheduledStart);
        }
        if (input.scheduledEnd) {
            body.scheduled_end = new Date(input.scheduledEnd);
        }
        if (typeof input.rawInput === "string" || input.rawInput === null) {
            body.raw_input = input.rawInput;
        }
        if (typeof input.parserConfidence === "number") {
            body.parser_confidence = Math.max(
                0,
                Math.min(100, input.parserConfidence),
            );
        }
        if (input.semanticMetadata) {
            body.semantic_metadata = input.semanticMetadata;
        }

        const updateResult = await db
            .update(task)
            .set(body)
            .where(
                and(
                    eq(task.id, taskId),
                    eq(task.user_id, session.user.id),
                ),
            );

        if (updateResult.rowCount === 0) {
            return NextResponse.json({
                error: "Task not found or could not be updated",
            }, { status: 404 });
        }

        return NextResponse.json({ message: "Task updated successfully" });
    } catch (error) {
        console.error("Error in PATCH /api/tasks:", error);
        return NextResponse.json({ error: "Internal Server Error" }, {
            status: 500,
        });
    }
}
