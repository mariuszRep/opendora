"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { ClockPlusIcon, TrashIcon, BellRingIcon, PlayIcon, PencilIcon } from "lucide-react"
import { toast } from "sonner"

import { opendora, type Schedule } from "@/lib/opendora"
import { getAgentColor } from "@/lib/agent-colors"
import { ScheduleDialog } from "@/components/sessions/schedule-dialog"

export default function SchedulesSettingsPage() {
  const router = useRouter()
  const [schedules, setSchedules] = React.useState<Schedule[]>([])
  const [editSchedule, setEditSchedule] = React.useState<Schedule | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  React.useEffect(() => {
    opendora.schedule.list().then(setSchedules).catch(console.error)
  }, [])

  const toggleSchedule = async (id: string, active: boolean) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active: active } : s))
    try {
      await opendora.schedule.update(id, { is_active: active })
    } catch (err) {
      console.error(err)
      setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active: !active } : s))
    }
  }

  const runNow = async (id: string) => {
    try {
      await opendora.schedule.run(id)
      toast.success("Schedule triggered!")
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger schedule")
    }
  }

  const deleteSchedule = async (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id))
    try {
      await opendora.schedule.remove(id)
    } catch (err) {
      console.error(err)
      opendora.schedule.list().then(setSchedules)
    }
  }

  const openEdit = (schedule: Schedule, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditSchedule(schedule)
    setDialogOpen(true)
  }

  const handleDoubleClick = (schedule: Schedule) => {
    const sessionId = schedule.session_id
    if (sessionId) {
      router.push(`/dashboard?session=${sessionId}&openSchedule=${schedule.id}`)
    } else {
      setEditSchedule(schedule)
      setDialogOpen(true)
    }
  }

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      opendora.schedule.list().then(setSchedules).catch(console.error)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Active Schedules</h2>
        <p className="text-muted-foreground">
          Manage your scheduled agent delegations and background tasks. Double-click a card to open its session.
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {schedules.map(schedule => {
          const color = getAgentColor(schedule.color)
          return (
            <Card
              key={schedule.id}
              className="flex flex-col cursor-pointer hover:border-primary/50 transition-colors"
              onDoubleClick={() => handleDoubleClick(schedule)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                 <div className="flex flex-col gap-1">
                   <CardTitle className="text-base flex items-center gap-2">
                     <div className="relative flex items-center justify-center size-4">
                       <div
                         className="absolute inset-0 rounded-full border-2"
                         style={{ borderColor: color.hex }}
                       />
                       <div
                         className="size-2 rounded-full"
                         style={{ backgroundColor: color.hex }}
                       />
                     </div>
                     <ClockPlusIcon className="size-4 text-muted-foreground" />
                     {schedule.cron_expression}
                   </CardTitle>
                   <CardDescription>Delegated to @{schedule.agent_id}</CardDescription>
                 </div>
                 <Switch
                   checked={schedule.is_active}
                   onCheckedChange={(v) => toggleSchedule(schedule.id, v)}
                 />
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-sm bg-muted/50 p-3 rounded-md line-clamp-3">
                  {schedule.prompt}
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between border-t pt-4">
                 <span className="text-xs text-muted-foreground flex items-center gap-1">
                   {schedule.is_active ? <BellRingIcon className="size-3 text-emerald-500" /> : <BellRingIcon className="size-3" />}
                   {schedule.is_active ? "Active" : "Paused"}
                 </span>
                 <div className="flex items-center gap-1">
                   <Button variant="ghost" size="icon-sm" onClick={(e) => openEdit(schedule, e)} title="Edit">
                     <PencilIcon className="size-4" />
                   </Button>
                   <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); runNow(schedule.id) }} title="Run now">
                     <PlayIcon className="size-4" />
                   </Button>
                   <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); deleteSchedule(schedule.id) }}>
                     <TrashIcon className="size-4 text-destructive" />
                   </Button>
                 </div>
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        schedule={editSchedule ?? undefined}
      />
    </div>
  )
}
