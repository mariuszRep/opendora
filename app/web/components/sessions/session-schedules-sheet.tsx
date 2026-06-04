"use client"

import { useEffect, useState } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScheduleCard } from "./schedule-card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { Session, Schedule } from "@/lib/opendora"
import { opendora } from "@/lib/opendora"
import { ScheduleDialog } from "./schedule-dialog"

interface SessionSchedulesSheetProps {
  session: Session | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionSchedulesSheet({ session, open, onOpenChange }: SessionSchedulesSheetProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | undefined>(undefined)

  // Load schedules for this session when the sheet opens
  useEffect(() => {
    if (!open || !session) return
    opendora.schedule.list()
      .then((all) => setSchedules(all.filter((s) => s.session_id === session.id)))
      .catch(console.error)
  }, [open, session, scheduleDialogOpen]) // re-fetch after dialog closes

  function refreshSchedules() {
    if (!session) return
    opendora.schedule.list()
      .then((all) => setSchedules(all.filter((s) => s.session_id === session.id)))
      .catch(console.error)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Schedules</SheetTitle>
            <SheetDescription className="sr-only">Manage session schedules</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-6 pb-3 shrink-0">
              <Button size="sm" className="w-full" onClick={() => { setEditingSchedule(undefined); setScheduleDialogOpen(true) }}>
                <PlusIcon className="mr-1.5 size-3.5" />
                Add Schedule
              </Button>
            </div>

            <div className="flex flex-col gap-3 px-6 flex-1 overflow-y-auto pb-4">
              {schedules.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No schedules yet. Add one to send timed messages to this session.
                </p>
              )}
              {schedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.id}
                  schedule={schedule}
                  onEdit={(s) => { setEditingSchedule(s); setScheduleDialogOpen(true) }}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={(v) => {
          setScheduleDialogOpen(v)
          if (!v) { setEditingSchedule(undefined); refreshSchedules() }
        }}
        sessionId={session?.id}
        agentId={session?.agentID ?? undefined}
        schedule={editingSchedule}
        onDeleted={() => { setScheduleDialogOpen(false); setEditingSchedule(undefined); refreshSchedules() }}
      />
    </>
  )
}
