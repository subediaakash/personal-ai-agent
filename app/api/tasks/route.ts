import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src/index";
import { task } from "@/drizzle/src/db/task-schema";
import { asc, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
            .where(eq(task.user_id, session.user.id))
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
