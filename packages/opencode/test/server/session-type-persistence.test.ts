import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { Server } from "../../src/server/server"
import { configureSessionCore } from "../../src/session"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("session type persistence", () => {
  test("creates sessions with the requested type", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        configureSessionCore()
        const app = Server.App()
        const createResponse = await app.request("/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionType: "scratchpad" }),
        })

        expect(createResponse.status).toBe(200)
        const created = await createResponse.json()

        expect(created.sessionType).toBe("scratchpad")
      },
    })
  })

  test("persists session type updates", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        configureSessionCore()
        const app = Server.App()
        const createResponse = await app.request("/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionType: "scope" }),
        })
        const created = await createResponse.json()

        const updateResponse = await app.request(`/session/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionType: "scratchpad" }),
        })

        expect(updateResponse.status).toBe(200)
        const updated = await updateResponse.json()
        expect(updated.sessionType).toBe("scratchpad")

        const listResponse = await app.request("/session")
        expect(listResponse.status).toBe(200)
        const sessions = await listResponse.json()
        const reloaded = sessions.find((session: { id: string }) => session.id === created.id)

        expect(reloaded?.sessionType).toBe("scratchpad")
      },
    })
  })
})
