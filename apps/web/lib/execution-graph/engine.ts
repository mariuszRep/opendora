import { ExecutionState, Step, Run, StepType } from "@/lib/execution-graph/types";

export const RUN_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
];

export const STEP_TYPE_COLORS: Partial<Record<StepType, string>> = {
  user: "hsl(var(--chart-4))",
};

export function generateId(): string {
  return Math.random().toString(16).substring(2, 9);
}

export function createInitialState(): ExecutionState {
  const rootId = "root001";
  const runId = "run-main";

  const rootStep: Step = {
    id: rootId,
    parents: [],
    type: "generic",
    content: "Start",
    timestamp: new Date().toISOString(),
    runId,
    labels: [],
  };

  const mainRun: Run = {
    id: runId,
    name: "main",
    color: RUN_COLORS[0],
    head: rootId,
  };

  return {
    steps: { [rootId]: rootStep },
    runs: { [runId]: mainRun },
    cursor: runId,
    stepOrder: [rootId],
  };
}
