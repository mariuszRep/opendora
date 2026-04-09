"use client"

import { Button } from "@/components/ui/button"
import type { PermissionRequest, PermissionReply } from "@/lib/opendora"

function getPermissionDescription(request: PermissionRequest) {
  const permission = request.permission
  const metadata = request.metadata || {}
  const patterns = request.patterns || []

  if (permission === "read") {
    return `Read ${patterns[0] || "file"}`
  }
  if (permission === "grep") {
    return `Search for "${patterns[0] || ""}"`
  }
  if (permission === "glob") {
    return `Find files matching "${patterns[0] || ""}"`
  }
  if (permission === "list") {
    return `List directory ${patterns[0] || ""}`
  }
  if (permission === "edit") {
    return `Edit ${metadata.filepath || "file"}`
  }
  if (permission === "bash") {
    return metadata.command ? `Run: ${metadata.command}` : "Run shell command"
  }
  if (permission === "external_directory") {
    const dir = metadata.parentDir || metadata.filepath || patterns[0] || ""
    return `Access external directory: ${dir}`
  }
  if (permission === "webfetch") {
    return `Fetch ${metadata.url || "web content"}`
  }
  if (permission === "websearch" || permission === "codesearch") {
    return `${permission === "websearch" ? "Web" : "Code"} search: ${metadata.query || ""}`
  }
  
  return `Use ${permission} tool`
}

export function PermissionTool(props: {
  request: PermissionRequest
  onReply: (requestID: string, reply: PermissionReply) => Promise<void>
  responded?: boolean
}) {
  const description = getPermissionDescription(props.request)
  const hasAlways = props.request.always && props.request.always.length > 0

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
        {props.request.metadata && Object.keys(props.request.metadata).length > 0 && (
          <div className="text-xs text-muted-foreground">
            This tool will execute with the requested parameters.
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
            onClick={() => props.onReply(props.request.id, "once")} 
            type="button" 
            variant="outline"
            size="sm"
          >
            Allow once
          </Button>
          {hasAlways && (
            <Button 
              onClick={() => props.onReply(props.request.id, "always")} 
              type="button"
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Allow always
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
