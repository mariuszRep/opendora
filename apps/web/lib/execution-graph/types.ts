export type StepType =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "node_output"
  | "generic";

export interface Step {
  id: string;
  parents: string[];
  type: StepType;
  content: string;
  nodeName?: string;
  author?: string;
  timestamp: string;
  runId: string;
  labels: string[];
  typeColor?: string;
}

export interface Run {
  id: string;
  name: string;
  color: string;
  head: string;
  parentRunId?: string;
}

export interface ExecutionState {
  steps: Record<string, Step>;
  runs: Record<string, Run>;
  cursor: string;
  stepOrder: string[];
}

export interface LayoutOptions {
  orientation: "vertical" | "horizontal";
  rowHeight: number;
  columnWidth: number;
  nodeRadius: number;
  lineWidth: number;
  nodeHeaderHeight: number;
  showLabels: boolean;
  showComments: boolean;
  theme: "github" | "minimal";
}
