"use client"

import { Button } from "@/components/ui/button"
import type { PermissionRequest, PermissionReply } from "@/lib/opendora"

function getPermissionDescription(request: PermissionRequest) {
  const { resource, access, metadata = {}, patterns = [] } = request

  if (resource === "file" && access === "read") return `Read ${patterns[0] || "file"}`
  if (resource === "file" && access === "write") return `Edit ${metadata.filepath || patterns[0] || "file"}`
  if (resource === "bash") return metadata.command ? `Run: ${metadata.command}` : "Run shell command"
  if (resource === "directory") return `Access directory: ${patterns[0] || ""}`
  if (resource === "network") return `Fetch ${metadata.url || metadata.query || patterns[0] || "network resource"}`
  if (resource === "tool") return `Use tool: ${patterns[0] || resource}`
  if (resource === "agent") return `Delegate to agent: ${patterns[0] || ""}`

  return `Use ${resource} (${access})`
}

export function PermissionTool(props: {
  request: PermissionRequest
  onReply: (requestID: string, reply: PermissionReply) => Promise<void>
  responded?: boolean
}) {
  const description = getPermissionDescription(props.request)
  const hasAgentPatterns = props.request.agent_patterns && props.request.agent_patterns.length > 0

  if (props.responded) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Permission granted</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{description}</p>
        {props.request.patterns && props.request.patterns.length > 0 && (
          <div className="rounded-md bg-muted/50 p-3 text-xs">
            <div className="text-muted-foreground mb-1.5">Patterns:</div>
            <ul className="space-y-1">
              {props.request.patterns.map((pattern, i) => (
                <li key={i} className="font-mono text-foreground">{pattern}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          onClick={() => props.onReply(props.request.id, "reject")}
          type="button"
          variant="ghost"
          size="sm"
        >
          Reject
        </Button>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => props.onReply(props.request.id, "session")}
            type="button"
            variant="outline"
            size="sm"
          >
            Allow session
          </Button>
          {hasAgentPatterns && (
            <Button
              onClick={() => props.onReply(props.request.id, "agent")}
              type="button"
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Allow agent
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
