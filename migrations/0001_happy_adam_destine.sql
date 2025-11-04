ALTER TABLE "task" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "reminders" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "audits" ALTER COLUMN "user_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "timezone";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "locale";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "metadata";