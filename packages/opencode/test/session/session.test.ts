import { describe, expect, test } from "bun:test"
import path from "path"
import { Session, configureSessionCore } from "../../src/session"
import { Bus } from "../../src/bus"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Agent } from "../../src/agent"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })
configureSessionCore()

describe("session.started event", () => {
  test("should emit session.started event when session is created", async () => {
    await Instance.provide({
      directory: projectRoot,
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
    await Instance.provide({
      directory: projectRoot,
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

describe("session default path inheritance", () => {
  test("session override beats agent default path and child inherits parent effective path", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        await Agent.create("path-agent", {
          name: "path-agent",
          mode: "primary",
          defaultPath: "/tmp/agent-default",
        })

        const root = await Session.create({
          agentID: "path-agent",
          defaultPath: "/tmp/session-override",
        })
        const child = await Session.create({
          parentID: root.id,
          agentID: "path-agent",
          spawnParentSessionID: root.id,
        })

        expect(await Session.effectiveDefaultPath(root.id)).toBe("/tmp/session-override")
        expect(await Session.effectiveDefaultPath(child.id)).toBe("/tmp/session-override")

        await Session.remove(root.id)
        await Agent.remove("path-agent")
      },
    })
  })

  test("main session inherits the agent default path when the session has none", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        await Agent.create("agent-main-path", {
          name: "agent-main-path",
          mode: "primary",
          defaultPath: "/tmp/main-agent-default",
        })

        const session = await Session.ensureMainSession("agent-main-path")

        expect(session.defaultPath).toBe("/tmp/main-agent-default")
        expect(await Session.effectiveDefaultPath(session.id)).toBe("/tmp/main-agent-default")

        await Session.remove(session.id)
        await Agent.remove("agent-main-path")
      },
    })
  })
})
