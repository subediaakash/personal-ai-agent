import { pgTable, serial, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { sql } from "drizzle-orm/sql/sql";
export const audits = pgTable("audits", {
    id: serial("id").primaryKey(),
    user_id: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    entity: varchar("entity", { length: 64 }).notNull(), // 'task'|'reminder'|'plan'
    entity_id: uuid("entity_id"),
    action: varchar("action", { length: 128 }).notNull(), // 'create'|'update'|'deliver'|'complete'
    payload: jsonb("payload").default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at").defaultNow().notNull(),
});