import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/drizzle/src";
import { task } from "@/drizzle/src/db/task-schema";
import { and, desc, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const rows = await db
    .select({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date,
      start: task.scheduled_start,
      end: task.scheduled_end,
      createdAt: task.created_at,
    })
    .from(task)
    .where(and(eq(task.user_id, session.user.id), eq(task.deleted, false)))
    .orderBy(desc(task.created_at))
    .limit(100);

  return (
    <div className="container mx-auto max-w-3xl py-8 space-y-6">
      <h1 className="text-2xl font-semibold">My Tasks</h1>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No tasks yet.</div>
      ) : (
        <div className="grid gap-4">
          {rows.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{t.title}</span>
                  <span className="text-xs rounded-md border px-2 py-0.5">{t.status}</span>
                </CardTitle>
                <CardDescription>
                  <span className="mr-3">Priority: {t.priority}</span>
                  {t.dueDate ? <span>Due: {new Date(t.dueDate).toLocaleString()}</span> : null}
                </CardDescription>
              </CardHeader>
              {t.description ? (
                <CardContent>
                  <p className="text-sm">{t.description}</p>
                  {(t.start || t.end) ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t.start ? `Start: ${new Date(t.start).toLocaleString()}` : null}
                      {t.start && t.end ? " · " : null}
                      {t.end ? `End: ${new Date(t.end).toLocaleString()}` : null}
                    </div>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


