/**
 * tasks
 * Core model for user tasks extracted by the LLM.
 * - title: what the user said (short)
 * - description: optional long text returned from parser
 * - due_date: date/time suggested or parsed
 * - due_date_tz: canonicalised timestamp in user's timezone (ISO string)
 * - scheduled_start / scheduled_end: if the planner assigned a time block
 * - raw_input: original user utterance for traceability
 * - semantic_metadata: additional structured fields parsed by LLM (jsonb)
 */

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
import { user } from "./auth-schema";
import { sql } from "drizzle-orm";

export const priority = pgEnum("task_priority", [
    "low",
    "medium",
    "high",
    "urgent",
]);
export const taskStatus = pgEnum("task_status", [
    "pending",
    "completed",
    "snoozed",
    "cancelled",
]);

export const task = pgTable("task", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: text("user_id")
        .references(() => user.id, { onDelete: "cascade" })
        .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    priority: priority("priority").default("medium").notNull(),
    status: taskStatus("status").default("pending").notNull(),
    // canonical due fields (timestamps stored in UTC)
    due_date: timestamp("due_date"),
    scheduled_start: timestamp("scheduled_start"),
    scheduled_end: timestamp("scheduled_end"),
    // original unstructured utterance & LLM outputs
    raw_input: text("raw_input"),
    // confidence score from parser (0-1)
    parser_confidence: integer("parser_confidence").default(0),
    // jsonb for storing NLP-parsed extras: {payee, amount, recurring, frequency, vendor_suggestion: {...}}
    semantic_metadata: jsonb("semantic_metadata").default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    completed_at: timestamp("completed_at"),
    // Soft-deletion (allows undo)
    deleted: boolean("deleted").default(false),
});
