export function generateStaticParams() { return [{ id: "new" }] }

import AgentSettingsClient from "./agent-settings-client"

export default function AgentSettingsPage() {
  return <AgentSettingsClient />
}
