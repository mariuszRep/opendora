# Workflow Design for OpenDora

## Overview

Workflows are JSON-style contracts that define step-by-step what an agent should do when executing a workflow. They combine delegations, skill loading, and task execution in a structured, declarative format.

## Key Concepts

### Workflow
A declarative JSON contract that defines a sequence of steps for an agent to execute.

### Step
A single unit of work in a workflow that can:
- Load a specific skill
- Perform a task using that skill
- Delegate to another agent (creating a sub-session)
- Define input/output contracts

### Delegation
Creates isolation by:
- Creating a sub-session (worker or scratchpad type)
- Optionally delegating to a different agent
- Loading a specific skill within that sub-session
- Returning results to the parent workflow

## Workflow Schema

```typescript
// Workflow Definition
interface Workflow {
  id: string
  name: string
  description?: string
  version: string
  
  // Execution settings
  settings: {
    agentId?: string              // Which agent to use (default: current agent)
    sessionType?: "worker" | "scope" | "scratchpad"
    maxSteps?: number             // Safety limit
    timeoutMs?: number            // Workflow timeout
  }
  
  // Input contract
  input?: {
    schema: Record<string, unknown>  // JSON Schema for input validation
    required: string[]
  }
  
  // Output contract
  output?: {
    schema: Record<string, unknown>  // JSON Schema for output validation
  }
  
  // Workflow steps
  steps: WorkflowStep[]
}

// Step Types
type WorkflowStep = 
  | SkillStep          // Load skill and perform task
  | DelegateStep       // Delegate to sub-session/agent
  | ParallelStep       // Execute multiple steps in parallel
  | ConditionalStep    // Branch based on condition
  | LoopStep           // Repeat step(s)

// Skill Step - Load skill and perform task
interface SkillStep {
  type: "skill"
  id: string
  
  // Skill to load
  skill: {
    name: string              // Skill name from skills registry
    version?: string
  }
  
  // Task definition
  task: {
    description: string       // What the agent should do
    input?: Record<string, unknown>  // Input to pass to skill
    output?: string          // Where to store output (reference name)
  }
  
  // Execution options
  options?: {
    tools?: string[]          // Restrict tools for this step
    permissions?: any         // Permission overrides
  }
  
  // Next step (if not sequential)
  next?: string | string[]   // Step ID(s) to execute next
}

// Delegate Step - Create sub-session and delegate
interface DelegateStep {
  type: "delegate"
  id: string
  
  // Delegation target
  delegate: {
    agentId?: string          // Different agent (default: same agent)
    sessionType: "worker" | "scratchpad"  // Sub-session type
    skill?: {
      name: string
      version?: string
    }
  }
  
  // Task for delegated session
  task: {
    description: string
    input?: Record<string, unknown>
  }
  
  // Result handling
  result: {
    output?: string          // Where to store delegated result
    merge?: boolean          // Merge output into parent context
  }
  
  // Next step
  next?: string | string[]
}

// Parallel Step - Execute multiple steps concurrently
interface ParallelStep {
  type: "parallel"
  id: string
  
  steps: WorkflowStep[]
  
  // How to combine results
  combine: {
    strategy: "merge" | "array" | "first" | "all"
    output?: string          // Where to store combined result
  }
  
  next?: string | string[]
}

// Conditional Step - Branch based on condition
interface ConditionalStep {
  type: "conditional"
  id: string
  
  condition: {
    field: string            // Field to check (e.g., "output.step1.success")
    operator: "eq" | "neq" | "gt" | "lt" | "exists" | "not_exists"
    value: unknown
  }
  
  branches: {
    true: WorkflowStep[]     // Steps if condition is true
    false?: WorkflowStep[]   // Steps if condition is false
  }
  
  next?: string | string[]
}

// Loop Step - Repeat step(s)
interface LoopStep {
  type: "loop"
  id: string
  
  loop: {
    count?: number           // Fixed number of iterations
    until?: {
      field: string
      operator: "eq" | "neq"
      value: unknown
    }
    while?: {
      field: string
      operator: "eq" | "neq" | "exists"
      value?: unknown
    }
  }
  
  steps: WorkflowStep[]
  
  next?: string | string[]
}
```

## Example Workflow

```json
{
  "id": "code-review-workflow",
  "name": "Code Review Workflow",
  "description": "Multi-step code review with delegation",
  "version": "1.0.0",
  "settings": {
    "agentId": "build",
    "sessionType": "worker",
    "maxSteps": 10
  },
  "input": {
    "schema": {
      "type": "object",
      "properties": {
        "filePath": { "type": "string" },
        "changeDescription": { "type": "string" }
      },
      "required": ["filePath"]
    }
  },
  "steps": [
    {
      "type": "skill",
      "id": "analyze-code",
      "skill": {
        "name": "code-analysis"
      },
      "task": {
        "description": "Analyze the code file for potential issues",
        "input": {
          "filePath": "{{input.filePath}}"
        },
        "output": "analysisResult"
      }
    },
    {
      "type": "delegate",
      "id": "security-check",
      "delegate": {
        "agentId": "security",
        "sessionType": "worker",
        "skill": {
          "name": "security-audit"
        }
      },
      "task": {
        "description": "Perform security audit on the file",
        "input": {
          "filePath": "{{input.filePath}}"
        }
      },
      "result": {
        "output": "securityResult",
        "merge": true
      }
    },
    {
      "type": "skill",
      "id": "generate-report",
      "skill": {
        "name": "report-generation"
      },
      "task": {
        "description": "Generate final review report combining analysis and security results",
        "input": {
          "analysis": "{{output.analysisResult}}",
          "security": "{{output.securityResult}}",
          "changeDescription": "{{input.changeDescription}}"
        },
        "output": "finalReport"
      }
    }
  ]
}
```

## Delegation Mechanism

### Sub-Session Creation

Delegation leverages the existing session system:

```typescript
interface DelegationContext {
  parentSessionId: string
  parentSessionInfo: Session.Info
  workflowId: string
  stepId: string
  
  // Create sub-session
  async createSubSession(options: {
    agentId?: string
    sessionType: "worker" | "scratchpad"
    skill?: Skill
  }): Promise<Session.Info>
  
  // Execute task in sub-session
  async executeInSubSession(
    sessionId: string,
    task: string,
    input?: Record<string, unknown>
  ): Promise<Record<string, unknown>>
  
  // Merge results back to parent
  async mergeResults(
    parentSessionId: string,
    results: Record<string, unknown>
  ): Promise<void>
}
```

### Delegation Flow

1. **Create sub-session** with `parentSessionID` set to current session
2. **Set session type** to `worker` or `scratchpad` for isolation
3. **Load skill** into sub-session context
4. **Execute task** with agent (same or different agent ID)
5. **Capture results** from sub-session
6. **Merge results** into parent workflow context
7. **Close sub-session** (archive or delete based on retention policy)

### Session Type Mapping

| Workflow Use Case | Session Type | Retention |
|---|---|---|
| Short-lived delegation | `worker` | autoArchive, maxMessages: 500 |
| Throwaway computation | `scratchpad` | autoDelete, ttlMs: 6h |
| Long-lived sub-agent | `role` | onExpire: "archive" |

## Execution Engine

### WorkflowExecutor

```typescript
class WorkflowExecutor {
  constructor(
    private sessionManager: SessionManager,
    private skillLoader: SkillLoader,
    private agentStorage: AgentStorage
  ) {}
  
  // Execute a workflow
  async execute(
    workflow: Workflow,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<WorkflowResult>
  
  // Execute single step
  async executeStep(
    step: WorkflowStep,
    context: StepContext
  ): Promise<StepResult>
  
  // Handle delegation
  async executeDelegation(
    step: DelegateStep,
    context: StepContext
  ): Promise<StepResult>
  
  // Handle skill loading
  async executeSkillStep(
    step: SkillStep,
    context: StepContext
  ): Promise<StepResult>
}
```

### Execution Context

```typescript
interface ExecutionContext {
  sessionId: string
  agentId: string
  workflowId: string
  
  // Input/output tracking
  input: Record<string, unknown>
  output: Record<string, unknown>
  
  // State tracking
  currentStepId?: string
  completedSteps: Set<string>
  
  // Delegation tracking
  delegations: Map<string, DelegationInfo>
}

interface DelegationInfo {
  subSessionId: string
  agentId: string
  stepId: string
  createdAt: number
  status: "pending" | "running" | "completed" | "failed"
}
```

## Integration Points

### Package: `packages/workflow` (New)

```
packages/workflow/
├── src/
│   ├── types.ts              # Workflow schemas (zod)
│   ├── executor.ts           # WorkflowExecutor class
│   ├── delegation.ts         # DelegationContext class
│   ├── parser.ts             # Workflow validation/parsing
│   ├── templates/            # Built-in workflow templates
│   │   ├── code-review.json
│   │   ├── test-generation.json
│   │   └── documentation.json
│   └── index.ts              # Public exports
├── package.json
└── AGENTS.md
```

### Dependencies

```json
{
  "dependencies": {
    "@opendora/session": "workspace:*",
    "@opendora/agent": "workspace:*",
    "@opendora/skills": "workspace:*",
    "zod": "^3.x"
  }
}
```

### Storage

Workflows stored in `.opendora/workflows/`:

```
.opendora/
└── workflows/
    ├── index.json              # Workflow registry
    ├── code-review/
    │   └── workflow.json      # Workflow definition
    └── test-generation/
        └── workflow.json
```

## Workflow Registry

```typescript
interface WorkflowRegistry {
  // List all workflows
  list(): Promise<WorkflowMetadata[]>
  
  // Get workflow by ID
  get(id: string): Promise<Workflow | undefined>
  
  // Create workflow
  create(id: string, workflow: Workflow): Promise<void>
  
  // Update workflow
  update(id: string, workflow: Workflow): Promise<void>
  
  // Delete workflow
  delete(id: string): Promise<void>
  
  // Validate workflow
  validate(workflow: Workflow): ValidationResult
}
```

## Tool Integration

New tools for workflow management:

- `workflow_list` - List available workflows
- `workflow_get` - Get workflow definition
- `workflow_execute` - Execute a workflow
- `workflow_validate` - Validate workflow schema
- `workflow_create` - Create new workflow
- `workflow_update` - Update existing workflow

## Security Considerations

### Permission Checks

- Workflow execution respects session permissions
- Delegation inherits parent session permissions unless explicitly overridden
- Skill loading respects skill permission settings (allow/deny/ask)

### Safety Limits

- `maxSteps` prevents infinite loops
- `timeoutMs` prevents runaway workflows
- `spawnDepth` limits delegation nesting (existing session field)
- Session retention policies automatically clean up sub-sessions

### Isolation

- Worker sessions have restricted tool access
- Scratchpad sessions are auto-deleted
- Delegation results are explicitly merged (no automatic state sharing)

## Open Questions

1. **Workflow storage location** - Should workflows be in `.opendora/workflows/` or a dedicated package?
2. **Workflow versioning** - How to handle workflow schema evolution?
3. **Error handling** - Should workflow stop on first error or continue?
4. **Parallel execution** - How to handle parallel step coordination?
5. **Workflow composition** - Can workflows include other workflows?
6. **Workflow templates** - Should there be built-in templates like agents?

## Next Steps

1. Create `packages/workflow` package
2. Implement workflow type schemas with zod
3. Implement WorkflowExecutor class
4. Implement DelegationContext class
5. Add workflow storage adapter
6. Integrate with session, agent, and skills packages
7. Add workflow management tools
8. Create example workflow templates
9. Write comprehensive tests
10. Document integration points
