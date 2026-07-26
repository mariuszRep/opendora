/**
 * Registers the two backstop layers for delegation delivery (see delegation.ts
 * for the full three-layer design):
 *   - layer 2: a session.status "idle" bus subscription, for any child loop
 *     that goes idle without its own noWait promise resolving through prompt.ts
 *     (e.g. it was picked up by a different process, or layer 1's callback itself
 *     threw before reaching Delegation.deliver).
 *   - layer 3: boot reconcile, for edges left "pending" by a server restart.
 *
 * Loaded via a side-effect import from packages/server/src/server.ts, matching
 * the registerBootstrapHook pattern already used by share-next.ts and command.ts —
 * see packages/runtime/src/bootstrap.ts's doc comment for why this indirection
 * exists (session/server would otherwise cycle back into runtime).
 */

import { Bus } from "@projectflows/runtime/bus"
import { registerBootstrapHook } from "@projectflows/runtime/bootstrap"
import { Log } from "@projectflows/util/log"
import { SessionStatus } from "./status.ts"
import { Delegation } from "./delegation.ts"
import { SessionPrompt } from "./prompt.ts"

const log = Log.create({ service: "delegation-listener" })

registerBootstrapHook(async () => {
  Bus.subscribe(SessionStatus.Event.Status, async (evt) => {
    if (evt.properties.status.type !== "idle") return
    const childSessionID = evt.properties.sessionID

    // Cheap pre-check before doing the message scan below.
    if (Delegation.pendingForChild(childSessionID).length === 0) return

    const turn = await SessionPrompt.lastCompletedTurn(childSessionID).catch((err) => {
      log.error("lastCompletedTurn failed", { childSessionID, err })
      return undefined
    })
    if (!turn) return

    const text = turn.finalMessage.parts.findLast((p) => p.type === "text")?.text ?? ""
    await Delegation.deliver(turn.userMessageID, {
      ...Delegation.classify(turn.finalMessage.info as any),
      result: text,
    }).catch((err) => log.error("deliver failed", { childSessionID, err }))
  })

  await Delegation.reconcileOnBoot().catch((err) => log.error("reconcileOnBoot failed", { err }))
})
