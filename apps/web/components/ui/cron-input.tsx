"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { PlusIcon, XIcon } from "lucide-react"

// ── Data ──────────────────────────────────────────────────────────────────

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DOW_SHORT   = ["Su","Mo","Tu","We","Th","Fr","Sa"]
const DOW_FULL    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

// ── Parse / build ─────────────────────────────────────────────────────────

interface CronFields { min: number[]; hour: number[]; dom: number[]; month: number[]; dow: number[] }

function parsePart(s: string): number[] {
  if (s === "*") return []
  return s.split(",").map(Number).filter(n => !isNaN(n))
}

function buildPart(values: number[]): string {
  return values.length === 0 ? "*" : [...values].sort((a, b) => a - b).join(",")
}

function parseCron(expr: string): CronFields {
  const [a = "*", b = "*", c = "*", d = "*", e = "*"] = expr.trim().split(/\s+/)
  return { min: parsePart(a), hour: parsePart(b), dom: parsePart(c), month: parsePart(d), dow: parsePart(e) }
}

function buildCron(f: CronFields): string {
  return `${buildPart(f.min)} ${buildPart(f.hour)} ${buildPart(f.dom)} ${buildPart(f.month)} ${buildPart(f.dow)}`
}

// ── Human-readable translation ────────────────────────────────────────────

function listJoin(items: string[]): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1]
}

function ordinal(n: number): string {
  const mod = n % 100
  const suffix = mod >= 11 && mod <= 13 ? "th"
    : n % 10 === 1 ? "st"
    : n % 10 === 2 ? "nd"
    : n % 10 === 3 ? "rd"
    : "th"
  return `${n}${suffix}`
}

export function cronToHuman(expr: string): string {
  try {
    const { min, hour, dom, month, dow } = parseCron(expr)

    let time: string
    if (min.length === 0 && hour.length === 0) {
      time = "every minute"
    } else if (hour.length === 0) {
      time = `at minute ${listJoin(min.map(String))} past every hour`
    } else if (min.length === 0) {
      time = `every minute during ${listJoin(hour.map(h => `${h}:xx`))}`
    } else {
      const pairs = hour.flatMap(h => min.map(m => `${h}:${String(m).padStart(2, "0")}`))
      time = `at ${listJoin(pairs)}`
    }

    const ctx: string[] = []
    if (dow.length > 0)   ctx.push(`on ${listJoin(dow.map(d => DOW_FULL[d]))}`)
    if (dom.length > 0)   ctx.push(`on the ${listJoin(dom.map(ordinal))}`)
    if (month.length > 0) ctx.push(`in ${listJoin(month.map(m => MONTH_FULL[m - 1]))}`)

    return `Runs ${time}${ctx.length ? ", " + ctx.join(", ") : ""}`
  } catch {
    return "Invalid expression"
  }
}

// ── Inline number grid (opens below the field on + click) ─────────────────

function NumberGrid({
  selected,
  from,
  to,
  cols,
  formatter,
  onToggle,
}: {
  selected: number[]
  from: number
  to: number
  cols: number
  formatter?: (n: number) => string
  onToggle: (n: number) => void
}) {
  const nums = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  return (
    <div
      className="rounded-md border bg-muted/40 p-1.5 mt-0.5"
      style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "2px" }}
    >
      {nums.map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onToggle(n)}
          className={cn(
            "rounded py-1 text-[11px] font-mono transition-colors text-center leading-none",
            selected.includes(n)
              ? "bg-primary text-primary-foreground"
              : "text-foreground/70 hover:bg-muted"
          )}
        >
          {formatter ? formatter(n) : String(n).padStart(2, "0")}
        </button>
      ))}
    </div>
  )
}

// ── CronField ─────────────────────────────────────────────────────────────

function CronField({
  label,
  values,
  from,
  to,
  cols,
  formatter,
  onChange,
}: {
  label: string
  values: number[]
  from: number
  to: number
  cols: number
  formatter?: (n: number) => string
  onChange: (v: number[]) => void
}) {
  const [open, setOpen] = React.useState(false)

  function toggle(n: number) {
    onChange(values.includes(n) ? values.filter(v => v !== n) : [...values, n])
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between min-h-[16px]">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {values.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            reset to *
          </button>
        )}
      </div>

      {/* Value display + add button */}
      <div className="flex flex-wrap items-center gap-1 min-h-[30px] rounded-md border border-input bg-background px-2 py-1">
        {values.length === 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground">* (any)</span>
        ) : (
          [...values].sort((a, b) => a - b).map(n => (
            <span
              key={n}
              className="inline-flex items-center gap-0.5 rounded bg-secondary text-secondary-foreground px-1.5 py-0.5 text-[11px] font-mono font-medium"
            >
              {formatter ? formatter(n) : String(n).padStart(2, "0")}
              <button
                type="button"
                onClick={() => toggle(n)}
                className="opacity-50 hover:opacity-100 ml-0.5 transition-opacity"
              >
                <XIcon className="size-2.5" />
              </button>
            </span>
          ))
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title="Add value"
          className={cn(
            "ml-auto flex items-center justify-center size-5 rounded transition-colors shrink-0",
            open ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <PlusIcon className="size-3" />
        </button>
      </div>

      {/* Inline picker — no z-index issues */}
      {open && (
        <NumberGrid
          selected={values}
          from={from}
          to={to}
          cols={cols}
          formatter={formatter}
          onToggle={toggle}
        />
      )}
    </div>
  )
}

// ── WeekdayField (always-visible toggle pills) ────────────────────────────

function WeekdayField({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  function toggle(d: number) {
    onChange(values.includes(d) ? values.filter(v => v !== d) : [...values, d])
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between min-h-[16px]">
        <span className="text-[11px] font-medium text-muted-foreground">Day of week</span>
        {values.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            reset to *
          </button>
        )}
      </div>
      <div className="flex gap-1">
        {DOW_SHORT.map((day, i) => (
          <button
            key={day}
            type="button"
            onClick={() => toggle(i)}
            className={cn(
              "flex-1 rounded-md border py-1 text-[11px] font-medium transition-colors",
              values.includes(i)
                ? "bg-primary text-primary-foreground border-primary"
                : "border-input text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── CronInput (public export) ─────────────────────────────────────────────

export interface CronInputProps {
  value?: string
  onChange?: (value: string) => void
}

export function CronInput({ value = "0 0 * * *", onChange }: CronInputProps) {
  const fields = React.useMemo(() => parseCron(value), [value])
  const human  = React.useMemo(() => cronToHuman(value), [value])

  function update(patch: Partial<CronFields>) {
    onChange?.(buildCron({ ...fields, ...patch }))
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-input bg-background/50 p-3">

      {/* ── Top 4 fields in a 2×2 grid ── */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <CronField
          label="Minute (0–59)"
          values={fields.min}
          from={0} to={59} cols={10}
          onChange={min => update({ min })}
        />
        <CronField
          label="Hour (0–23)"
          values={fields.hour}
          from={0} to={23} cols={6}
          onChange={hour => update({ hour })}
        />
        <CronField
          label="Day of month (1–31)"
          values={fields.dom}
          from={1} to={31} cols={7}
          onChange={dom => update({ dom })}
        />
        <CronField
          label="Month (1–12)"
          values={fields.month}
          from={1} to={12} cols={3}
          formatter={n => MONTH_SHORT[n - 1]}
          onChange={month => update({ month })}
        />
      </div>

      {/* ── Weekday pills ── */}
      <WeekdayField values={fields.dow} onChange={dow => update({ dow })} />

      {/* ── Human-readable translation ── */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs border border-border/40">
        <code className="font-mono text-[11px] text-foreground/50 shrink-0">{value}</code>
        <span className="text-border/60 select-none shrink-0">·</span>
        <span className="text-muted-foreground">{human}</span>
      </div>
    </div>
  )
}
