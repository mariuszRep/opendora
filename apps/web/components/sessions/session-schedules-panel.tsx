"use client"

import { useEffect, useState } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScheduleCard } from "./schedule-card"
import type { Session, Schedule } from "@/lib/projectflows"
import { opendora } from "@/lib/projectflows"
import { ScheduleDialog } from "./schedule-dialog"

interface SessionSchedulesPanelProps {
  session: Session | null
}

export function SessionSchedulesPanel({ session }: SessionSchedulesPanelProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | undefined>(undefined)

  function refreshSchedules() {
    if (!session) return
    opendora.schedule.list()
      .then((all) => setSchedules(all.filter((s) => s.session_id === session.id)))
      .catch(console.error)
  }

  useEffect(() => {
    refreshSchedules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scheduleDialogOpen]) // re-fetch after dialog closes

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <Button size="sm" className="w-full" onClick={() => { setEditingSchedule(undefined); setScheduleDialogOpen(true) }}>
          <PlusIcon className="mr-1.5 size-3.5" />
          Add Schedule
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
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
    </div>
  )
}
