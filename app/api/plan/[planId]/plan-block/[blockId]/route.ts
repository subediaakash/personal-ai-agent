import { db } from "@/drizzle/src";
import { planBlocks } from "@/drizzle/src/db/plan-schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function GET(
    req: Request,
    { params }: { params: { planId: string; blockId: string } }
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { planId, blockId } = params;

        const rows = await db
            .select()
            .from(planBlocks)
            .where(and(eq(planBlocks.id, blockId), eq(planBlocks.plan_id, planId)));

        if (rows.length === 0) {
            return NextResponse.json({ error: "Block not found" }, { status: 404 });
        }

        return NextResponse.json({ block: rows[0] }, { status: 200 });
    } catch (error) {
        console.error("Error fetching plan block:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: { planId: string; blockId: string } }
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { planId, blockId } = params;

        const deleted = await db
            .delete(planBlocks)
            .where(and(eq(planBlocks.id, blockId), eq(planBlocks.plan_id, planId)))
            .returning({ id: planBlocks.id });

        if (deleted.length === 0) {
            return NextResponse.json(
                { error: "Block not found or could not be deleted" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Block deleted successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting plan block:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { planId: string; blockId: string } }
) {
    try {
        const h = await headers();
        const session = await auth.api.getSession({ headers: h });

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { planId, blockId } = params;
        const body = await req.json();

        const updated = await db
            .update(planBlocks)
            .set(body)
            .where(and(eq(planBlocks.id, blockId), eq(planBlocks.plan_id, planId)))
            .returning();

        if (updated.length === 0) {
            return NextResponse.json(
                { error: "Block not found or could not be updated" },
                { status: 404 }
            );
        }

        return NextResponse.json({ block: updated[0] }, { status: 200 });
    } catch (error) {
        console.error("Error updating plan block:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}