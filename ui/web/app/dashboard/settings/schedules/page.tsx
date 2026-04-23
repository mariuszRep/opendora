"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlusIcon, ClockPlusIcon, SearchIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { SettingsCard } from "@/components/settings/settings-card"
import { opendora, type Schedule } from "@/lib/opendora"
import { ScheduleDialog } from "@/components/sessions/schedule-dialog"

export default function SchedulesSettingsPage() {

  const [schedules, setSchedules] = React.useState<Schedule[]>([])
  const [editSchedule, setEditSchedule] = React.useState<Schedule | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

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

  const filteredSchedules = React.useMemo(() => {
    if (!searchQuery) return schedules
    const query = searchQuery.toLowerCase()
    return schedules.filter(
      (schedule) =>
        schedule.name?.toLowerCase().includes(query) ||
        schedule.prompt?.toLowerCase().includes(query) ||
        schedule.cron_expression?.toLowerCase().includes(query)
    )
  }, [schedules, searchQuery])

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
          Double-click a card to view or edit. All actions are available inside the schedule editor.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search schedules by name, prompt, or cron..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filteredSchedules.length === 0 ? (
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
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-6xl">
          {filteredSchedules.map(schedule => (
            <SettingsCard
              key={schedule.id}
              title={schedule.name || schedule.cron_expression}
              description={schedule.prompt}
              onDoubleClick={() => { setEditSchedule(schedule); setDialogOpen(true) }}
              footer={
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <ClockPlusIcon className="size-3 shrink-0" />
                    {schedule.cron_expression}
                  </span>
                  <span className={`text-xs flex items-center gap-1 ${schedule.is_active ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {schedule.is_active ? "Active" : "Paused"}
                  </span>
                </div>
              }
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
