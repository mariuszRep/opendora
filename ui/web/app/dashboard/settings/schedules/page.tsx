"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { PlusIcon, ClockPlusIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
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
    <SettingsPageLayout
      title="Schedules"
      headerAction={
        <Button onClick={() => { setEditSchedule(null); setDialogOpen(true) }}>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Schedule
        </Button>
      }
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Schedules</h1>
        <p className="text-muted-foreground">
          Click a card to view or edit. All actions are available inside the schedule editor.
        </p>
      </div>

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
          <ClockPlusIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No schedules yet</h3>
          <p className="text-muted-foreground text-center mb-4">
            Create your first schedule to delegate work in the background
          </p>
          <Button onClick={() => { setEditSchedule(null); setDialogOpen(true) }}>
            <PlusIcon className="mr-2 h-4 w-4" />
            New Schedule
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 max-w-4xl">
          {schedules.map(schedule => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onEdit={(s) => { setEditSchedule(s); setDialogOpen(true) }}
            />
          ))}
        </div>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        schedule={editSchedule ?? undefined}
        onDeleted={() => handleDialogClose(false)}
      />
    </SettingsPageLayout>
  )
}
