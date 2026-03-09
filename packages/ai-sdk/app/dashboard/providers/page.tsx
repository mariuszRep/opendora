"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2Icon, CircleIcon, ExternalLinkIcon, KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { opendora, type AuthMethod, type Provider } from "@/lib/opendora"

type ProviderState = {
  provider: Provider
  methods: AuthMethod[]
  connected: boolean
}

type ApiKeyFormState = {
  providerID: string
  key: string
  saving: boolean
  error: string | null
}

export default function ProvidersPage() {
  const router = useRouter()
  const { providers, connectedProviders } = useOpendoraContext()
  const [authMethods, setAuthMethods] = useState<Record<string, AuthMethod[]>>({})
  const [apiKeyForm, setApiKeyForm] = useState<ApiKeyFormState | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)

  useEffect(() => {
    opendora.provider.authMethods().then(setAuthMethods).catch(() => {})
  }, [])

  const providerStates: ProviderState[] = providers.map((p) => ({
    provider: p,
    methods: authMethods[p.id] ?? [],
    connected: connectedProviders.includes(p.id),
  }))

  async function handleSaveApiKey() {
    if (!apiKeyForm || !apiKeyForm.key.trim()) return
    setApiKeyForm((f) => f && { ...f, saving: true, error: null })
    try {
      await opendora.auth.set(apiKeyForm.providerID, { type: "api", key: apiKeyForm.key.trim() })
      setApiKeyForm(null)
      // Reload the page to refresh connected providers
      router.refresh()
    } catch (err) {
      setApiKeyForm((f) => f && { ...f, saving: false, error: err instanceof Error ? err.message : "Failed to save" })
    }
  }

  async function handleRemove(providerID: string) {
    setRemoving(providerID)
    try {
      await opendora.auth.remove(providerID)
      router.refresh()
    } catch {
      // ignore
    } finally {
      setRemoving(null)
    }
  }

  async function handleOAuth(providerID: string, methodIndex: number) {
    setOauthLoading(providerID)
    try {
      const { url } = await opendora.provider.oauthAuthorize(providerID, methodIndex)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      // ignore
    } finally {
      setOauthLoading(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                href="/dashboard"
                className="cursor-pointer"
                onClick={(e) => { e.preventDefault(); router.push("/dashboard") }}
              >
                Dashboard
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Providers</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Connect AI providers by adding API keys or signing in with OAuth.
          </p>

          {providerStates.length === 0 && (
            <p className="text-sm text-muted-foreground">No providers available.</p>
          )}

          {providerStates.map(({ provider, methods, connected }) => (
            <div key={provider.id} className="rounded-lg border p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={`https://models.dev/logos/${provider.id}.svg`}
                    alt={provider.name}
                    className="size-4 dark:invert"
                    width={16}
                    height={16}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                  />
                  <span className="font-medium text-sm">{provider.name}</span>
                  <span className="text-xs text-muted-foreground">({provider.id})</span>
                </div>
                <div className="flex items-center gap-2">
                  {connected ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2Icon className="size-3.5" />
                        Connected
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(provider.id)}
                        disabled={removing === provider.id}
                        title="Disconnect"
                      >
                        {removing === provider.id
                          ? <Loader2Icon className="size-3.5 animate-spin" />
                          : <Trash2Icon className="size-3.5" />}
                      </Button>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CircleIcon className="size-3.5" />
                      Not connected
                    </span>
                  )}
                </div>
              </div>

              {/* Auth method buttons */}
              {!connected && methods.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {methods.map((method, idx) => (
                    method.type === "api" ? (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setApiKeyForm({ providerID: provider.id, key: "", saving: false, error: null })}
                      >
                        <KeyRoundIcon className="size-3.5" />
                        {method.label ?? "Enter API key"}
                      </Button>
                    ) : (
                      <Button
                        key={idx}
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={oauthLoading === provider.id}
                        onClick={() => handleOAuth(provider.id, idx)}
                      >
                        {oauthLoading === provider.id
                          ? <Loader2Icon className="size-3.5 animate-spin" />
                          : <ExternalLinkIcon className="size-3.5" />}
                        {method.label ?? "Sign in"}
                      </Button>
                    )
                  ))}
                </div>
              )}

              {/* Inline API key form */}
              {apiKeyForm?.providerID === provider.id && (
                <div className="flex flex-col gap-2 pt-1">
                  <Label htmlFor={`key-${provider.id}`} className="text-xs">API key</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${provider.id}`}
                      type="password"
                      placeholder="sk-…"
                      value={apiKeyForm.key}
                      onChange={(e) => setApiKeyForm((f) => f && { ...f, key: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveApiKey() }}
                      className="font-mono text-xs"
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveApiKey} disabled={apiKeyForm.saving || !apiKeyForm.key.trim()}>
                      {apiKeyForm.saving && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setApiKeyForm(null)}>
                      Cancel
                    </Button>
                  </div>
                  {apiKeyForm.error && <p className="text-xs text-destructive">{apiKeyForm.error}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
