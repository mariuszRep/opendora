"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { CalendarClockIcon, TrashIcon, BellRingIcon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { opendora, type Schedule } from "@/lib/opendora"

export default function SchedulesSettingsPage() {
  const [schedules, setSchedules] = React.useState<Schedule[]>([])

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

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Active Schedules</h2>
        <p className="text-muted-foreground">
          Manage your scheduled agent delegations and background tasks.
        </p>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {schedules.map(schedule => (
          <Card key={schedule.id} className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
               <div className="flex flex-col gap-1">
                 <CardTitle className="text-base flex items-center gap-2">
                   <CalendarClockIcon className="size-4 text-muted-foreground" />
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
                 <Button variant="ghost" size="icon-sm" onClick={() => runNow(schedule.id)} title="Run now">
                   <PlayIcon className="size-4" />
                 </Button>
                 <Button variant="ghost" size="icon-sm" onClick={() => deleteSchedule(schedule.id)}>
                   <TrashIcon className="size-4 text-destructive" />
                 </Button>
               </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
