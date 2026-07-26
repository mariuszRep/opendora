"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { PermissionRequest, PermissionReply } from "@/lib/projectflows"

function getPermissionInfo(request: PermissionRequest) {
  const { resource, access, metadata = {}, patterns = [] } = request

  if (resource === "file" && access === "write") {
    return {
      title: `Edit ${(metadata.filepath as string) || patterns[0] || "file"}`,
      description: "This tool wants to modify a file",
    }
  }

  if (resource === "file" && access === "read") {
    return {
      title: `Read ${patterns[0] || "file"}`,
      description: "This tool wants to read a file or directory",
    }
  }

  if (resource === "directory") {
    return {
      title: `Access directory ${patterns[0] || ""}`,
      description: "This tool wants to access a directory",
    }
  }

  if (resource === "bash") {
    return {
      title: "Run shell command",
      description: metadata.command ? `$ ${metadata.command}` : "This tool wants to execute a shell command",
    }
  }

  if (resource === "tool" && typeof metadata.description === "string") {
    return {
      title: "Create task",
      description: metadata.description || "This tool wants to create a subtask",
    }
  }

  if (resource === "directory" && access === "*") {
    const filepath = metadata.filepath as string
    const parentDir = metadata.parentDir as string
    const dir = parentDir || filepath || request.patterns[0] || ""
    return {
      title: `Access external directory`,
      description: `Path: ${dir}`,
    }
  }

  if (resource === "network") {
    return {
      title: "Network access",
      description: (metadata.url as string) ? `URL: ${metadata.url}` : (metadata.query as string) ? `Query: ${metadata.query}` : "This tool wants to access the network",
    }
  }

  if (metadata.kind === "workflow_node") {
    return {
      title: `Approve step: ${(metadata.nodeLabel as string) || patterns[0] || "workflow node"}`,
      description: "This workflow step requires approval before it runs",
    }
  }

  return {
    title: `Use ${resource} (${access})`,
    description: "This tool requires permission to execute",
  }
}

export function PermissionDock(props: {
  request: PermissionRequest
  onReply: (requestID: string, reply: PermissionReply) => Promise<void>
}) {
  const info = getPermissionInfo(props.request)
  const hasAgentPatterns = props.request.agent_patterns && props.request.agent_patterns.length > 0
  const isWorkflowNode = props.request.metadata?.kind === "workflow_node"

  return (
    <Card className="border-warning/30 bg-background/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-warning">△</span>
          Permission required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="font-medium">{info.title}</div>
          {info.description && (
            <div className="text-muted-foreground text-sm mt-1">{info.description}</div>
          )}
        </div>
        {props.request.patterns && props.request.patterns.length > 0 && (
          <div className="text-sm">
            <div className="text-muted-foreground mb-1">Patterns:</div>
            <ul className="list-disc list-inside space-y-1">
              {props.request.patterns.map((pattern, i) => (
                <li key={i} className="text-sm font-mono">{pattern}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button
          onClick={() => props.onReply(props.request.id, "reject")}
          type="button"
          variant="ghost"
        >
          Reject
        </Button>
        <div className="flex gap-2">
          {isWorkflowNode ? (
            <>
              <Button
                onClick={() => props.onReply(props.request.id, "once")}
                type="button"
                variant="outline"
              >
                Allow once
              </Button>
              <Button
                onClick={() => props.onReply(props.request.id, "session")}
                type="button"
                variant="outline"
              >
                Allow for session
              </Button>
              <Button
                onClick={() => props.onReply(props.request.id, "workflow")}
                type="button"
              >
                Allow for workflow
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => props.onReply(props.request.id, "session")}
                type="button"
                variant="outline"
              >
                Allow session
              </Button>
              {hasAgentPatterns && (
                <Button
                  onClick={() => props.onReply(props.request.id, "agent")}
                  type="button"
                >
                  Allow agent
                </Button>
              )}
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
