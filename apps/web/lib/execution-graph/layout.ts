import { ExecutionState, Step, LayoutOptions, Run } from "@/lib/execution-graph/types";

export interface RenderStep {
  id: string;
  x: number;
  y: number;
  row: number;
  col: number;
  color: string;
  isCursor: boolean;
  isRunStart: boolean;
  step: Step;
}

export interface RenderPath {
  id: string;
  d: string;
  color: string;
  isMerge: boolean;
}

export interface RenderRunTag {
  name: string;
  color: string;
  x: number;
  y: number;
  isCursor: boolean;
}

export interface RenderLayout {
  steps: RenderStep[];
  paths: RenderPath[];
  runTags: RenderRunTag[];
  width: number;
  height: number;
}

function assignRunColumns(
  runs: Record<string, Run>,
  steps: Record<string, Step>,
  stepOrder: string[]
): Record<string, number> {
  const firstStepIndex: Record<string, number> = {};
  for (let i = 0; i < stepOrder.length; i++) {
    const step = steps[stepOrder[i]];
    if (step && firstStepIndex[step.runId] === undefined) {
      firstStepIndex[step.runId] = i;
    }
  }

  const children: Record<string, string[]> = {};
  const hasParent = new Set<string>();

  for (const run of Object.values(runs)) {
    if (run.parentRunId && runs[run.parentRunId]) {
      if (!children[run.parentRunId]) children[run.parentRunId] = [];
      children[run.parentRunId].push(run.id);
      hasParent.add(run.id);
    }
  }

  for (const parentId of Object.keys(children)) {
    children[parentId].sort(
      (a, b) => (firstStepIndex[a] ?? Infinity) - (firstStepIndex[b] ?? Infinity)
    );
  }

  const roots = Object.values(runs)
    .filter((r) => !hasParent.has(r.id))
    .sort((a, b) => {
      if (a.name === "main") return -1;
      if (b.name === "main") return 1;
      return (firstStepIndex[a.id] ?? 0) - (firstStepIndex[b.id] ?? 0);
    });

  const colMap: Record<string, number> = {};
  let nextFreeCol = 0;

  function visit(runId: string, col: number): void {
    colMap[runId] = col;
    if (col >= nextFreeCol) nextFreeCol = col + 1;

    const kids = children[runId] ?? [];
    if (kids.length === 0) return;

    if (kids.length === 1) {
      visit(kids[0], col);
    } else {
      visit(kids[0], col);
      for (let i = 1; i < kids.length; i++) {
        visit(kids[i], nextFreeCol++);
      }
    }
  }

  for (const root of roots) {
    if (colMap[root.id] === undefined) {
      const col = nextFreeCol++;
      visit(root.id, col);
    }
  }

  for (const run of Object.values(runs)) {
    if (colMap[run.id] === undefined) {
      colMap[run.id] = nextFreeCol++;
    }
  }

  return colMap;
}

export function computeLayout(
  state: ExecutionState,
  options: LayoutOptions
): RenderLayout {
  const { rowHeight, columnWidth, nodeRadius } = options;
  void nodeRadius; // used by callers for rendering
  const { stepOrder, steps, runs, cursor } = state;

  const runColumns = assignRunColumns(runs, steps, stepOrder);

  const rowMap: Record<string, number> = {};
  stepOrder.forEach((id, idx) => { rowMap[id] = idx; });

  const totalRows = stepOrder.length;
  const totalCols = Math.max(Math.max(...Object.values(runColumns), 0) + 1, 1);

  const padX = columnWidth * 0.8;
  const getX = (col: number) => padX + col * columnWidth;
  const getY = (row: number) => (row + 0.5) * rowHeight;

  const cursorRun = runs[cursor];
  const cursorStepId = cursorRun?.head;

  const seenRuns = new Set<string>();
  const renderSteps: RenderStep[] = stepOrder.map((id, idx) => {
    const step = steps[id];
    const col = runColumns[step.runId] ?? 0;
    const runColor = runs[step.runId]?.color ?? "#9CA3AF";
    const dotColor = step.typeColor ?? runColor;
    const isRunStart = !seenRuns.has(step.runId);
    if (isRunStart) seenRuns.add(step.runId);

    return {
      id,
      row: idx,
      col,
      x: getX(col),
      y: getY(idx),
      color: dotColor,
      isCursor: id === cursorStepId,
      isRunStart,
      step,
    };
  });

  const renderPaths: RenderPath[] = [];

  for (const rs of renderSteps) {
    const childX = rs.x;
    const childY = rs.y;
    const childCol = rs.col;
    const childRow = rs.row;

    rs.step.parents.forEach((parentId, parentIdx) => {
      const parentStep = steps[parentId];
      if (!parentStep) return;

      const parentRow = rowMap[parentId];
      if (parentRow === undefined) return;

      const parentCol = runColumns[parentStep.runId] ?? 0;
      const parentX = getX(parentCol);
      const parentY = getY(parentRow);

      const pathId = `${parentId}-${rs.id}-${parentIdx}`;
      const isMergeLine = parentIdx > 0;

      const parentColor = parentStep.typeColor ?? (runs[parentStep.runId]?.color ?? "#9CA3AF");
      const lineColor = isMergeLine
        ? (runs[parentStep.runId]?.color ?? "#9CA3AF")
        : parentColor;

      let d = "";

      if (parentCol === childCol) {
        d = `M ${parentX} ${parentY} L ${childX} ${childY}`;
      } else {
        const isBranchOut = !isMergeLine && childRow === parentRow + 1;

        if (isBranchOut) {
          const bendY = parentY + rowHeight * 0.4;
          d =
            `M ${parentX} ${parentY} ` +
            `C ${parentX} ${parentY + rowHeight * 0.15}, ${childX} ${bendY - rowHeight * 0.15}, ${childX} ${bendY} ` +
            `L ${childX} ${childY}`;
        } else if (isMergeLine) {
          const bendY = childY - rowHeight * 0.4;
          d =
            `M ${parentX} ${parentY} ` +
            `L ${parentX} ${bendY} ` +
            `C ${parentX} ${bendY + rowHeight * 0.15}, ${childX} ${childY - rowHeight * 0.15}, ${childX} ${childY}`;
        } else {
          const bendY = parentY + rowHeight * 0.5;
          d =
            `M ${parentX} ${parentY} ` +
            `C ${parentX} ${parentY + rowHeight * 0.2}, ${childX} ${bendY - rowHeight * 0.2}, ${childX} ${bendY} ` +
            `L ${childX} ${childY}`;
        }
      }

      renderPaths.push({ id: pathId, d, color: lineColor, isMerge: isMergeLine });
    });
  }

  const renderRunTags: RenderRunTag[] = [];

  for (const run of Object.values(runs)) {
    const headStep = steps[run.head];
    if (!headStep) continue;

    const row = rowMap[run.head];
    if (row === undefined) continue;

    const col = runColumns[headStep.runId] ?? 0;

    renderRunTags.push({
      name: run.name,
      color: run.color,
      x: getX(col),
      y: getY(row),
      isCursor: cursor === run.id,
    });
  }

  const width = padX * 2 + (totalCols - 1) * columnWidth + 80;
  const height = totalRows * rowHeight;

  return {
    steps: renderSteps,
    paths: renderPaths,
    runTags: renderRunTags,
    width,
    height,
  };
}
