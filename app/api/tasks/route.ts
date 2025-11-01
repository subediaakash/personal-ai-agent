import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src/index";
import { task } from "@/drizzle/src/db/task-schema";


export async function GET() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const userTasks = await db.select({ taskId: task.id , taskName: task.name }).from("task").where({
        user_id: session.user.id,
    });

    return new Response(JSON.stringify(userTasks), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
    });

}