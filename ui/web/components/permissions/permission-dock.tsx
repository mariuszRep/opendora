"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { PermissionRequest, PermissionReply } from "@/lib/opendora"

function getPermissionInfo(request: PermissionRequest) {
  const permission = request.permission
  const metadata = request.metadata || {}

  if (permission === "edit") {
    const filepath = metadata.filepath as string
    return {
      title: `Edit ${filepath}`,
      description: "This tool wants to modify a file",
    }
  }

  if (permission === "read") {
    const patterns = request.patterns || []
    return {
      title: `Read ${patterns[0] || "file"}`,
      description: "This tool wants to read a file or directory",
    }
  }

  if (permission === "glob") {
    const patterns = request.patterns || []
    return {
      title: `Search files matching "${patterns[0] || ""}"`,
      description: "This tool wants to find files by pattern",
    }
  }

  if (permission === "grep") {
    const patterns = request.patterns || []
    return {
      title: `Search for "${patterns[0] || ""}"`,
      description: "This tool wants to search file contents",
    }
  }

  if (permission === "list") {
    const patterns = request.patterns || []
    return {
      title: `List directory ${patterns[0] || ""}`,
      description: "This tool wants to list directory contents",
    }
  }

  if (permission === "bash") {
    return {
      title: "Run shell command",
      description: metadata.command ? `$ ${metadata.command}` : "This tool wants to execute a shell command",
    }
  }

  if (permission === "task") {
    return {
      title: "Create task",
      description: metadata.description as string || "This tool wants to create a subtask",
    }
  }

  if (permission === "external_directory") {
    const filepath = metadata.filepath as string
    const parentDir = metadata.parentDir as string
    const dir = parentDir || filepath || request.patterns[0] || ""
    return {
      title: `Access external directory`,
      description: `Path: ${dir}`,
    }
  }

  if (permission === "webfetch") {
    return {
      title: "Fetch web content",
      description: metadata.url ? `URL: ${metadata.url}` : "This tool wants to fetch content from the web",
    }
  }

  if (permission === "websearch" || permission === "codesearch") {
    return {
      title: permission === "websearch" ? "Web search" : "Code search",
      description: metadata.query ? `Query: ${metadata.query}` : "This tool wants to search",
    }
  }

  return {
    title: `Use ${permission} tool`,
    description: "This tool requires permission to execute",
  }
}

export function PermissionDock(props: {
  request: PermissionRequest
  onReply: (requestID: string, reply: PermissionReply) => Promise<void>
}) {
  const info = getPermissionInfo(props.request)
  const hasAlways = props.request.always && props.request.always.length > 0

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
          <Button 
            onClick={() => props.onReply(props.request.id, "once")} 
            type="button" 
            variant="outline"
          >
            Allow once
          </Button>
          {hasAlways && (
            <Button 
              onClick={() => props.onReply(props.request.id, "always")} 
              type="button"
            >
              Allow always
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
