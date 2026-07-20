"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PackageIcon, CheckIcon, Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { opendora, type PackDefinition } from "@/lib/projectflows"

export default function OnboardingPage() {
  const router = useRouter()
  const [packs, setPacks] = useState<PackDefinition[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    opendora.plugin
      .listCatalogPacks()
      .then(setPacks)
      .catch(() => setPacks([]))
      .finally(() => setLoading(false))
  }, [])

  async function install() {
    if (!selected) return
    setInstalling(true)
    setError(null)
    try {
      await opendora.plugin.installCatalogPack(selected)
      router.push("/dashboard")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Installation failed")
      setInstalling(false)
    }
  }

  async function skip() {
    setInstalling(true)
    try {
      await opendora.plugin.skipOnboarding()
    } catch {
      // non-fatal — skip always proceeds
    }
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <PackageIcon className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Set up capabilities</h1>
          <p className="text-sm text-muted-foreground">
            Choose a capability pack to get started, or skip to use the bare minimum.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : packs.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No capability packs found. Set{" "}
              <code className="font-mono text-xs bg-muted px-1 rounded">PROJECTFLOWS_REGISTRY_PATH</code> to your
              local registry path.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {packs.map((pack) => (
              <button
                key={pack.id}
                onClick={() => setSelected(pack.id)}
                className="w-full text-left"
                disabled={installing}
              >
                <Card
                  className={`transition-colors cursor-pointer ${
                    selected === pack.id ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40"
                  }`}
                >
                  <CardHeader className="flex-row items-start justify-between pb-2">
                    <div>
                      <CardTitle className="text-base">{pack.name}</CardTitle>
                      <CardDescription className="text-sm mt-0.5">{pack.description}</CardDescription>
                    </div>
                    {selected === pack.id && <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-1" />}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-1">
                      {pack.plugins.map((p) => (
                        <span
                          key={p}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-mono"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive text-center">{error}</p>}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={install} disabled={!selected || installing || loading}>
            {installing ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                Installing…
              </>
            ) : (
              "Get Started"
            )}
          </Button>
          <Button variant="ghost" onClick={skip} disabled={installing}>
            Skip
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          You can install or change capability packs later from{" "}
          <span className="font-medium">Settings → Plugins</span>.
        </p>
      </div>
    </div>
  )
}
