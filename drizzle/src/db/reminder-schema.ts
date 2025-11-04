import {
    boolean,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";
import { task } from "./task-schema";
import { planBlocks } from "./plan-schema";
export const reminderChannel = pgEnum("reminder_channel", [
    "in_app",
    "email",
    "telegram",
    "whatsapp",
]);

export const reminders = pgTable("reminders", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: text("user_id").references(() => user.id, { onDelete: "cascade" })
        .notNull(),
    // Link to a task or plan_block (one of them non-null)
    task_id: uuid("task_id").references(() => task.id, { onDelete: "cascade" }),
    plan_block_id: uuid("plan_block_id").references(() => planBlocks.id, {
        onDelete: "cascade",
    }),
    // when to deliver (UTC)
    deliver_at: timestamp("deliver_at").notNull(),
    // scheduled / delivered / failed
    delivered: boolean("delivered").default(false),
    delivered_at: timestamp("delivered_at"),
    // list of channels: prefer one; channels can be stored in jsonb for multi-channel attempts
    channel: reminderChannel("channel").default("in_app").notNull(),
    // context payload for notification rendering (title, body, deep_link)
    payload: jsonb("payload").default(sql`'{}'::jsonb`),
    // retry / attempts metadata
    attempts: integer("attempts").default(0),
    last_error: text("last_error"),
    created_at: timestamp("created_at").defaultNow().notNull(),
});
