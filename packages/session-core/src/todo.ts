import z from "zod"
import { eq, asc } from "drizzle-orm"
import { TodoTable } from "./session.sql"
import { getConfig } from "./config"

// Inline BusEvent.define
function defineBusEvent<Type extends string>(type: Type, properties: z.ZodType<any>) {
  return { type, properties }
}

export namespace Todo {
  export const Info = z
    .object({
      content: z.string().describe("Brief description of the task"),
      status: z.string().describe("Current status of the task: pending, in_progress, completed, cancelled"),
      priority: z.string().describe("Priority level of the task: high, medium, low"),
    })
    .meta({ ref: "Todo" })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: defineBusEvent(
      "todo.updated",
      z.object({
        sessionID: z.string(),
        todos: z.array(Info),
      }),
    ),
  }

  export function update(input: { sessionID: string; todos: Info[] }) {
    const db = getConfig().db
    // Use a transaction
    const txFn = () => {
      db.delete(TodoTable).where(eq(TodoTable.session_id, input.sessionID)).run()
      if (input.todos.length === 0) return
      db.insert(TodoTable)
        .values(
          input.todos.map((todo, position) => ({
            session_id: input.sessionID,
            content: todo.content,
            status: todo.status,
            priority: todo.priority,
            position,
          })),
        )
        .run()
    }
    if (typeof db.transaction === "function") {
      db.transaction(txFn)
    } else {
      txFn()
    }
    getConfig().bus?.publish(Event.Updated, input)
  }

  export function get(sessionID: string): Info[] {
    const db = getConfig().db
    const rows = db
      .select()
      .from(TodoTable)
      .where(eq(TodoTable.session_id, sessionID))
      .orderBy(asc(TodoTable.position))
      .all()
    return rows.map((row: any) => ({
      content: row.content,
      status: row.status,
      priority: row.priority,
    }))
  }
}
