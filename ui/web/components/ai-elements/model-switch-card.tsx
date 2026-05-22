"use client";

import type React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRightIcon, AlertTriangleIcon, RotateCwIcon, ComponentIcon } from "lucide-react";
import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";

export type SlotStatus = "failed" | "active" | "retrying" | "standby";

export interface ProviderModelCardProps {
  providerID: string;
  modelID: string;
  modelName?: string;
  status: SlotStatus;
  statusCode?: number;
  resetAt?: number;
  retryAttempt?: number;
  retryDelay?: number;
}

export function ProviderModelCard({
  providerID,
  modelID,
  modelName,
  status,
  statusCode,
  resetAt,
  retryAttempt,
  retryDelay,
}: ProviderModelCardProps) {
  const formatResetAt = (ts: number): string => {
    const diffMs = ts - Date.now();
    if (diffMs <= 0) return "soon";
    const h = Math.floor(diffMs / 3_600_000);
    const m = Math.floor((diffMs % 3_600_000) / 60_000);
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  };

  const containerCn: Record<SlotStatus, string> = {
    failed:  "border-destructive/50 bg-destructive/5",
    active:  "border-accent bg-accent/10",
    retrying:"border-amber-500/50 bg-amber-500/5",
    standby: "border-border bg-background",
  };

  const badgeCn: Record<SlotStatus, string> = {
    failed:  "border-destructive/40 bg-destructive/10 text-destructive dark:text-red-400",
    active:  "border-accent/40 bg-accent/10 text-accent-foreground",
    retrying:"border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    standby: "border-border text-muted-foreground",
  };

  const statusIcon: Record<SlotStatus, React.ReactNode> = {
    failed:  <AlertTriangleIcon className="size-3.5 shrink-0 text-destructive" />,
    active:  null,
    retrying:<RotateCwIcon className="size-3.5 shrink-0 animate-spin text-amber-500" />,
    standby: null,
  };

  const subtext =
    status === "failed" && statusCode
      ? `HTTP ${statusCode}${resetAt ? ` · back ${formatResetAt(resetAt)}` : ""}`
      : status === "failed" && resetAt
        ? `back ${formatResetAt(resetAt)}`
        : status === "retrying" && retryAttempt !== undefined && retryDelay !== undefined
          ? `retry ${retryAttempt} in ${Math.ceil(retryDelay / 1000)}s`
          : null;

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150",
        containerCn[status]
      )}
    >
      <ModelSelectorLogo provider={providerID} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium leading-none text-foreground">
          {modelName ?? modelID}
        </span>
        <span className="truncate text-[10px] leading-none text-muted-foreground">
          {subtext ?? providerID}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge
          variant="outline"
          className={cn("h-4 px-1.5 text-[10px] font-medium", badgeCn[status])}
        >
          {status}
        </Badge>
        {statusIcon[status]}
      </div>
    </div>
  );
}

function deriveErrorLabel(errorMessage?: string, firstFailedStatusCode?: number, isRetrying?: boolean): string {
  if (isRetrying) return "Retrying with fallback provider…";
  if (errorMessage) return errorMessage;
  if (firstFailedStatusCode === 429) return "Quota reached — switching to fallback provider";
  if (firstFailedStatusCode === 401 || firstFailedStatusCode === 403) return "Authentication error — switching provider";
  if (firstFailedStatusCode && firstFailedStatusCode >= 500) return "Service unavailable — switching provider";
  if (firstFailedStatusCode) return `Provider error ${firstFailedStatusCode} — switching provider`;
  return "Provider failed — switching to fallback";
}

export interface ModelSwitchCardProps {
  fallbackGroup?: {
    id: string;
    name: string;
    slots: Array<{ providerID: string; modelID: string; modelName?: string }>;
  };
  currentSlot?: { providerID: string; modelID: string; modelName?: string };
  failedSlots?: Array<{ providerID: string; modelID: string; statusCode?: number; resetAt?: number }>;
  errorMessage?: string;
  retryAttempt?: number;
  retryDelay?: number;
}

export function ModelSwitchCard({
  fallbackGroup,
  currentSlot,
  failedSlots = [],
  errorMessage,
  retryAttempt,
  retryDelay,
}: ModelSwitchCardProps) {
  const isRetrying = retryAttempt !== undefined;
  const firstFailedStatusCode = failedSlots[0]?.statusCode;
  const errorLabel = deriveErrorLabel(errorMessage, firstFailedStatusCode, isRetrying);

  const renderCards = () => {
    if (fallbackGroup && fallbackGroup.slots.length > 0) {
      return fallbackGroup.slots.map((slot, index) => {
        const isFailed = failedSlots.some(
          (f) => f.providerID === slot.providerID && f.modelID === slot.modelID
        );
        const failedInfo = failedSlots.find(
          (f) => f.providerID === slot.providerID && f.modelID === slot.modelID
        );

        let status: SlotStatus = "standby";
        if (isFailed) status = "failed";
        else if (currentSlot?.providerID === slot.providerID && currentSlot?.modelID === slot.modelID) {
          status = isRetrying ? "retrying" : "active";
        }

        return (
          <div key={`${slot.providerID}/${slot.modelID}`} className="flex items-center gap-1.5">
            <ProviderModelCard
              providerID={slot.providerID}
              modelID={slot.modelID}
              modelName={slot.modelName}
              status={status}
              statusCode={failedInfo?.statusCode}
              resetAt={failedInfo?.resetAt}
              retryAttempt={retryAttempt}
              retryDelay={retryDelay}
            />
            {index < fallbackGroup.slots.length - 1 && (
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
          </div>
        );
      });
    }

    if (currentSlot) {
      const isFailed = failedSlots.some(
        (f) => f.providerID === currentSlot.providerID && f.modelID === currentSlot.modelID
      );
      const failedInfo = failedSlots.find(
        (f) => f.providerID === currentSlot.providerID && f.modelID === currentSlot.modelID
      );
      let status: SlotStatus = isRetrying ? "retrying" : "active";
      if (isFailed) status = "failed";

      return (
        <ProviderModelCard
          providerID={currentSlot.providerID}
          modelID={currentSlot.modelID}
          modelName={currentSlot.modelName}
          status={status}
          statusCode={failedInfo?.statusCode}
          resetAt={failedInfo?.resetAt}
          retryAttempt={retryAttempt}
          retryDelay={retryDelay}
        />
      );
    }

    return null;
  };

  return (
    <div className="not-prose overflow-hidden rounded-md border bg-background text-foreground">
      {/* Header: 3-col grid so center text is truly centered without clipping */}
      <div className="grid grid-cols-[1.5rem_1fr_1.5rem] items-center gap-2 bg-muted/80 px-4 py-3">
        <div className="flex items-center justify-start">
          {isRetrying
            ? <RotateCwIcon className="size-4 animate-spin text-amber-500" />
            : <AlertTriangleIcon className="size-4 text-red-500" />
          }
        </div>
        <p className="truncate text-center text-sm font-medium text-foreground">
          {errorLabel}
        </p>
        <div />
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {fallbackGroup && (
          <div className="flex items-center gap-1.5">
            <ComponentIcon className="size-3 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{fallbackGroup.name}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {renderCards()}
        </div>
      </div>
    </div>
  );
}
