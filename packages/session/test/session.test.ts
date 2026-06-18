import { describe, expect, test } from "bun:test"
import { Session } from "../src/session"
import { configureSessionCore } from "@opendora/server/configure-session-core"
import { Bus } from "@opendora/runtime/bus"
import { Log } from "@opendora/util/log"
import { Instance } from "@opendora/runtime/instance"
import { Agent } from "@opendora/runtime/agent"
import { tmpdir } from "./fixture/fixture"

Log.init({ print: false })
configureSessionCore()

describe("session.started event", () => {
  test("should emit session.started event when session is created", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        let eventReceived = false
        let receivedInfo: Session.Info | undefined

        const unsub = Bus.subscribe(Session.Event.Created, (event) => {
          eventReceived = true
          receivedInfo = event.properties.info as Session.Info
        })

        const session = await Session.create({})

        await new Promise((resolve) => setTimeout(resolve, 100))

        unsub()

        expect(eventReceived).toBe(true)
        expect(receivedInfo).toBeDefined()
        expect(receivedInfo?.id).toBe(session.id)
        expect(receivedInfo?.projectID).toBe(session.projectID)
        expect(receivedInfo?.directory).toBe(session.directory)
        expect(receivedInfo?.title).toBe(session.title)

        await Session.remove(session.id)
      },
    })
  })

  test("session.started event should be emitted before session.updated", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const events: string[] = []

        const unsubStarted = Bus.subscribe(Session.Event.Created, () => {
          events.push("started")
        })

        const unsubUpdated = Bus.subscribe(Session.Event.Updated, () => {
          events.push("updated")
        })

        const session = await Session.create({})

        await new Promise((resolve) => setTimeout(resolve, 100))

        unsubStarted()
        unsubUpdated()

        expect(events).toContain("started")
        expect(events).toContain("updated")
        expect(events.indexOf("started")).toBeLessThan(events.indexOf("updated"))

        await Session.remove(session.id)
      },
    })
  })
})

describe("session path inheritance", () => {
  test("session.path beats agent.defaultPaths[0] and child inherits parent path", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await Agent.create("path-agent", {
          name: "path-agent",
          mode: "primary",
          defaultPaths: ["/tmp/agent-default"],
        })

        const root = await Session.create({
          agentID: "path-agent",
        })
        // Manually set path on the root session to override agent default
        await Session.setPath({ sessionID: root.id, path: "/tmp/session-override" })
        const rootUpdated = await Session.get(root.id)
        const child = await Session.create({
          agentID: "path-agent",
          parentSessionID: root.id,
        })

        expect(rootUpdated.path).toBe("/tmp/session-override")
        expect(child.path).toBe("/tmp/session-override")

        await Session.remove(root.id)
        await Agent.remove("path-agent")
      },
    })
  })

  test("main session uses agent.defaultPaths[0] when set", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await Agent.create("agent-main-path", {
          name: "agent-main-path",
          mode: "primary",
          defaultPaths: ["/tmp/main-agent-default"],
        })

        const session = await Session.ensureMainSession("agent-main-path")

        expect(session.path).toBe("/tmp/main-agent-default")

        await Session.remove(session.id)
        await Agent.remove("agent-main-path")
      },
    })
  })
})
