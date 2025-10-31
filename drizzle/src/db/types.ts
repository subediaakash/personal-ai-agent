import { audits, task, planBlocks, plans, reminders, user } from './schema';


export type Tables = {
    users: typeof user;
    tasks: typeof task;
    plans: typeof plans;
    plan_blocks: typeof planBlocks;
    reminders: typeof reminders;
    audits: typeof audits;
};
