"use client"

import * as React from "react"
import { Separator } from "@/components/ui/separator"
import { opendora, type Schedule } from "@/lib/opendora"
import { ScheduleCard } from "@/components/sessions/schedule-card"
import { ScheduleDialog } from "@/components/sessions/schedule-dialog"

export default function SchedulesSettingsPage() {

  const [schedules, setSchedules] = React.useState<Schedule[]>([])
  const [editSchedule, setEditSchedule] = React.useState<Schedule | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  React.useEffect(() => {
    opendora.schedule.list().then(setSchedules).catch(console.error)
  }, [])

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditSchedule(null)
      opendora.schedule.list().then(setSchedules).catch(console.error)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Active Schedules</h2>
        <p className="text-muted-foreground">
          Click a card to view or edit. All actions are available inside the schedule editor.
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        {schedules.map(schedule => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            onEdit={(s) => { setEditSchedule(s); setDialogOpen(true) }}
          />
        ))}
      </div>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        schedule={editSchedule ?? undefined}
        onDeleted={() => handleDialogClose(false)}
      />
    </div>
  )
}
