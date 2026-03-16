import z from "zod"
import { spawn } from "child_process"
import { Tool } from "../tool.ts"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { host, directory } from "../host.ts"
import { fileURLToPath } from "url"
import { Language } from "web-tree-sitter"
import { $ } from "bun"
import { Filesystem } from "../lib/filesystem.ts"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = 2 * 60 * 1000

const BLACKLIST = new Set(["fish", "nu"])

function getAcceptableShell(): string {
  const s = process.env.SHELL
  if (s && !BLACKLIST.has(process.platform === "win32" ? path.win32.basename(s) : path.basename(s))) return s
  if (process.platform === "win32") {
    const git = Bun.which("git")
    if (git) {
      const bash = path.join(git, "..", "..", "bin", "bash.exe")
      const stat = Filesystem.stat(bash)
      if (stat?.size) return bash
    }
    return process.env.COMSPEC || "cmd.exe"
  }
  if (process.platform === "darwin") return "/bin/zsh"
  const bash = Bun.which("bash")
  if (bash) return bash
  return "/bin/sh"
}

async function killTree(proc: ReturnType<typeof spawn>, opts?: { exited?: () => boolean }): Promise<void> {
  const pid = proc.pid
  if (!pid || opts?.exited?.()) return

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
      killer.once("exit", () => resolve())
      killer.once("error", () => resolve())
    })
    return
  }

  const SIGKILL_TIMEOUT_MS = 200
  try {
    process.kill(-pid, "SIGTERM")
    await Bun.sleep(SIGKILL_TIMEOUT_MS)
    if (!opts?.exited?.()) {
      process.kill(-pid, "SIGKILL")
    }
  } catch (_e) {
    proc.kill("SIGTERM")
    await Bun.sleep(SIGKILL_TIMEOUT_MS)
    if (!opts?.exited?.()) {
      proc.kill("SIGKILL")
    }
  }
}

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

let _parser: ReturnType<typeof import("web-tree-sitter").then> | null = null
async function getParser() {
  if (_parser) return _parser
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  _parser = p as any
  return p
}

// TODO: we may wanna rename this tool so it works better on other shells
export const BashTool = Tool.define("bash", async () => {
  const shell = getAcceptableShell()

  return {
    description: DESCRIPTION,
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      timeout: z.number().describe("Optional timeout in milliseconds").optional(),
      workdir: z
        .string()
        .describe(
          "The working directory to run the command in. Use this instead of 'cd' commands.",
        )
        .optional(),
      description: z
        .string()
        .describe(
          "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
        ),
    }),
    async execute(params, ctx) {
      const h = host(ctx)
      const dir = directory(ctx)
      const cwd = params.workdir || dir
      const timeout = params.timeout ?? (h.flags?.["OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"] as number | undefined) ?? DEFAULT_TIMEOUT

      if (params.timeout !== undefined && params.timeout < 0) {
        throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
      }

      const parser = await getParser()
      const tree = await (parser as any).parse(params.command)
      if (!tree) {
        throw new Error("Failed to parse command")
      }
      const directories = new Set<string>()
      const containsPath = h.containsPath ?? ((p: string) => !path.relative(h.worktree ?? dir, p).startsWith(".."))
      if (!containsPath(cwd)) directories.add(cwd)
      const patterns = new Set<string>()
      const always = new Set<string>()

      for (const node of tree.rootNode.descendantsOfType("command")) {
        if (!node) continue

        // Get full command text including redirects if present
        let commandText = node.parent?.type === "redirected_statement" ? node.parent.text : node.text

        const command = []
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (!child) continue
          if (
            child.type !== "command_name" &&
            child.type !== "word" &&
            child.type !== "string" &&
            child.type !== "raw_string" &&
            child.type !== "concatenation"
          ) {
            continue
          }
          command.push(child.text)
        }

        // not an exhaustive list, but covers most common cases
        if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat"].includes(command[0])) {
          for (const arg of command.slice(1)) {
            if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
            const resolved = await $`realpath ${arg}`
              .cwd(cwd)
              .quiet()
              .nothrow()
              .text()
              .then((x: string) => x.trim())
            if (resolved) {
              const normalized =
                process.platform === "win32" ? Filesystem.windowsPath(resolved).replace(/\//g, "\\") : resolved
              if (!containsPath(normalized)) {
                const dir2 = (await Filesystem.isDir(normalized)) ? normalized : path.dirname(normalized)
                directories.add(dir2)
              }
            }
          }
        }

        // cd covered by above check
        if (command.length && command[0] !== "cd") {
          patterns.add(commandText)
          // prefix permission pattern: "command *"
          always.add(command[0] + " *")
        }
      }

      if (directories.size > 0) {
        const globs = Array.from(directories).map((d) => {
          // Preserve POSIX-looking paths with /s, even on Windows
          if (d.startsWith("/")) return `${d.replace(/[\\/]+$/, "")}/*`
          return path.join(d, "*")
        })
        await ctx.ask({
          permission: "external_directory",
          patterns: globs,
          always: globs,
          metadata: {},
        })
      }

      if (patterns.size > 0) {
        await ctx.ask({
          permission: "bash",
          patterns: Array.from(patterns),
          always: Array.from(always),
          metadata: {},
        })
      }

      // Collect shell env from plugin trigger if available
      let shellEnv: Record<string, string> = {}
      if (h.pluginTrigger) {
        const result = await h.pluginTrigger(
          "shell.env",
          { cwd, sessionID: ctx.sessionID, callID: ctx.callID },
          { env: {} },
        ) as any
        shellEnv = result?.env ?? {}
      }

      const proc = spawn(params.command, {
        shell,
        cwd,
        env: {
          ...process.env,
          ...shellEnv,
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      })

      let output = ""

      // Initialize metadata with empty output
      ctx.metadata({
        metadata: {
          output: "",
          description: params.description,
        },
      })

      const append = (chunk: Buffer) => {
        output += chunk.toString()
        ctx.metadata({
          metadata: {
            // truncate the metadata to avoid GIANT blobs of data (has nothing to do w/ what agent can access)
            output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
            description: params.description,
          },
        })
      }

      proc.stdout?.on("data", append)
      proc.stderr?.on("data", append)

      let timedOut = false
      let aborted = false
      let exited = false

      const kill = () => killTree(proc, { exited: () => exited })

      if (ctx.abort.aborted) {
        aborted = true
        await kill()
      }

      const abortHandler = () => {
        aborted = true
        void kill()
      }

      ctx.abort.addEventListener("abort", abortHandler, { once: true })

      const timeoutTimer = setTimeout(() => {
        timedOut = true
        void kill()
      }, timeout + 100)

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeoutTimer)
          ctx.abort.removeEventListener("abort", abortHandler)
        }

        proc.once("exit", () => {
          exited = true
          cleanup()
          resolve()
        })

        proc.once("error", (error) => {
          exited = true
          cleanup()
          reject(error)
        })
      })

      const resultMetadata: string[] = []

      if (timedOut) {
        resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
      }

      if (aborted) {
        resultMetadata.push("User aborted the command")
      }

      if (resultMetadata.length > 0) {
        output += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
      }

      return {
        title: params.description,
        metadata: {
          output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
          exit: proc.exitCode,
          description: params.description,
        },
        output,
      }
    },
  }
})
