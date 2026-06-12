import { Hono } from "hono"
import fs from "fs/promises"
import path from "path"
import { Global } from "@opendora/util/global"
import { lazy } from "@opendora/util/lazy"

type UserProfile = { name: string; color: string }

const DEFAULT: UserProfile = { name: "", color: "blue" }

function filePath() {
  return path.join(Global.Path.config, "user.json")
}

async function readUser(): Promise<UserProfile> {
  try {
    const text = await fs.readFile(filePath(), "utf8")
    const parsed = JSON.parse(text)
    return { ...DEFAULT, ...parsed }
  } catch {
    return { ...DEFAULT }
  }
}

async function writeUser(data: UserProfile): Promise<void> {
  await fs.writeFile(filePath(), JSON.stringify(data, null, 2))
}

export const UserRoutes = lazy(() =>
  new Hono()
    .get("/", async (c) => {
      return c.json(await readUser())
    })
    .patch("/", async (c) => {
      const patch = await c.req.json<Partial<UserProfile>>()
      const current = await readUser()
      const updated: UserProfile = {
        name: patch.name !== undefined ? patch.name : current.name,
        color: patch.color !== undefined ? patch.color : current.color,
      }
      await writeUser(updated)
      return c.json(updated)
    }),
)
