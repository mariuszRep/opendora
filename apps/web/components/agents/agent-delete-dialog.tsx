"use client"

import { useState } from "react"
import { Loader2Icon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentId: string
  agentName: string
  onDeleted?: () => void
}

export function AgentDeleteDialog({ open, onOpenChange, agentId, agentName, onDeleted }: Props) {
  const { deleteAgent } = useOpendoraContext()
  const [deleting, setDeleting] = useState(false)

  async function handleConfirm() {
    setDeleting(true)
    try {
      await deleteAgent(agentId)
      onOpenChange(false)
      onDeleted?.()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{agentName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the agent&apos;s folder from <code>.projectflows/agents/{agentId}</code> and
            its index entry. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
          >
            {deleting && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
