import { describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "@opendora/session/session"
import { Log } from "@opendora/util/log"
import { Instance } from "@opendora/runtime/instance"
import { Server } from "@opendora/server/server"
import { configureSessionCore } from "@opendora/server/configure-session-core"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("tui.selectSession endpoint", () => {
  test("should return 200 when called with valid session", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        configureSessionCore()
        const session = await Session.create({})

        // #when
        const app = Server.App()
        const response = await app.request("/tui/select-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: session.id }),
        })

        // #then
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toBe(true)

        await Session.remove(session.id)
      },
    })
  })

  test("should return 404 when session does not exist", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        configureSessionCore()
        const nonExistentSessionID = "ses_nonexistent123"

        // #when
        const app = Server.App()
        const response = await app.request("/tui/select-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: nonExistentSessionID }),
        })

        // #then
        expect(response.status).toBe(404)
      },
    })
  })

  test("should return 400 when session ID format is invalid", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        configureSessionCore()
        const invalidSessionID = "invalid_session_id"

        // #when
        const app = Server.App()
        const response = await app.request("/tui/select-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionID: invalidSessionID }),
        })

        // #then
        expect(response.status).toBe(400)
      },
    })
  })
})
