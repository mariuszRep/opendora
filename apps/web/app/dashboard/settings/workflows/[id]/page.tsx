export function generateStaticParams() { return [{ id: "new" }] }

import WorkflowEditorClient from "./workflow-editor-client"

export default function WorkflowEditorPage() {
  return <WorkflowEditorClient />
}
