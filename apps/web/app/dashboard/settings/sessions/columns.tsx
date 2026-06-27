"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown, CalendarIcon, MessageSquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

export type SessionRow = {
  id: string
  title: string
  agentID: string
  agentName: string
  agentColor: string
  sessionType: string
  created: number
}

export function createSessionColumns(
  onOpen: (id: string) => void,
): ColumnDef<SessionRow>[] {
  return [
    {
      id: "select",
      size: 40,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableColumnFilter: false,
    },
    {
      id: "icon",
      size: 48,
      cell: () => <MessageSquareIcon className="h-4 w-4 text-muted-foreground" />,
      enableSorting: false,
      enableColumnFilter: false,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("title")}</span>
      ),
      filterFn: (row, _columnId, filterValue: string) => {
        if (!filterValue) return true
        const query = filterValue.toLowerCase()
        const title = row.getValue<string>("title").toLowerCase()
        const agentName = row.original.agentName.toLowerCase()
        return title.includes(query) || agentName.includes(query)
      },
    },
    {
      accessorKey: "agentID",
      header: "Agent",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: row.original.agentColor }}
          />
          {row.original.agentName ? (
            <span className="capitalize">{row.original.agentName}</span>
          ) : (
            <span className="text-muted-foreground italic text-xs">No agent</span>
          )}
        </div>
      ),
      filterFn: (row, _columnId, filterValue: string) => {
        if (!filterValue) return true
        if (filterValue === "__none__") return !row.getValue<string>("agentID")
        return row.getValue<string>("agentID") === filterValue
      },
      enableSorting: false,
    },
    {
      accessorKey: "sessionType",
      header: "Type",
      size: 100,
      cell: ({ row }) =>
        row.getValue<string>("sessionType") === "role" ? (
          <Badge variant="default" className="text-xs">
            Main
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            Standard
          </Badge>
        ),
      enableSorting: false,
      enableColumnFilter: false,
    },
    {
      accessorKey: "created",
      size: 200,
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Created
          <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue<number>("created"))
        return (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarIcon className="h-3 w-3" />
            <span>
              {date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              {date.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )
      },
      sortingFn: "basic",
    },
    {
      id: "actions",
      size: 80,
      cell: ({ row }) => (
        <div className="text-right">
          <Button variant="ghost" size="sm" onClick={() => onOpen(row.original.id)}>
            Open
          </Button>
        </div>
      ),
      enableSorting: false,
      enableColumnFilter: false,
    },
  ]
}
