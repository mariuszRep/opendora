import { ScheduleTable } from "./schedule.sql";
import { Cron } from "croner";
import { eq } from "drizzle-orm";

export type ScheduleDispatchFn = (schedule: {
  id: string
  session_id: string | null
  agent_id: string | null
  prompt: string
  action_type: string
  tool_name: string | null
}) => Promise<void>

export class CronScheduler {
  private reloadTimer: ReturnType<typeof setInterval> | null = null;
  private jobs: Map<string, Cron> = new Map();
  private db: any;
  private dispatch: ScheduleDispatchFn;
  private getTimezone: () => string;
  private currentTimezone: string = "";

  constructor(db: any, dispatch: ScheduleDispatchFn, getTimezone: () => string) {
    this.db = db;
    this.dispatch = dispatch;
    this.getTimezone = getTimezone;
  }

  start() {
    this.loadSchedules();
    // Re-sync every 60s to pick up newly created/toggled schedules
    this.reloadTimer = setInterval(() => this.loadSchedules(), 60_000);
  }

  stop() {
    if (this.reloadTimer) clearInterval(this.reloadTimer);
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }

  private async loadSchedules() {
    const tz = this.getTimezone();
    const timezoneChanged = tz !== this.currentTimezone;

    if (timezoneChanged) {
      for (const job of this.jobs.values()) job.stop();
      this.jobs.clear();
      this.currentTimezone = tz;
    }

    const activeSchedules: any[] = await this.db
      .select()
      .from(ScheduleTable)
      .where(eq(ScheduleTable.is_active, true))
      .all() ?? [];

    const activeIds = new Set(activeSchedules.map((s) => s.id));

    for (const [id, job] of this.jobs) {
      if (!activeIds.has(id)) {
        job.stop();
        this.jobs.delete(id);
      }
    }

    for (const schedule of activeSchedules) {
      if (this.jobs.has(schedule.id)) continue;
      try {
        const job = new Cron(
          schedule.cron_expression,
          { timezone: tz, protect: true },
          async () => {
            await this.executeJob(schedule);
          },
        );
        this.jobs.set(schedule.id, job);
      } catch (err) {
        console.error(`Error scheduling job ${schedule.id}:`, err);
      }
    }
  }

  private async executeJob(schedule: any) {
    try {
      await this.dispatch(schedule);
    } catch (e) {
      console.error(`Failed to dispatch schedule ${schedule.id}:`, e);
    }

    await this.db
      .update(ScheduleTable)
      .set({ last_executed: Date.now() })
      .where(eq(ScheduleTable.id, schedule.id))
      .run();
  }
}
