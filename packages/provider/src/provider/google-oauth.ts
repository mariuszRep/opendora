import { OAuth2Client, type Credentials } from "google-auth-library"
import * as http from "node:http"
import * as net from "node:net"
import { URL } from "node:url"
import crypto from "node:crypto"

export namespace GoogleOAuth {
  const OAUTH_CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com"
  const OAUTH_CLIENT_SECRET = "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"
  const OAUTH_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ]

  const REDIRECT_PATH = "/oauth2callback"
  const AUTH_TIMEOUT = 5 * 60 * 1000
  const SUCCESS_HTML = `
    <html>
      <head><title>Authentication Successful</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>✓ Authentication Successful!</h1>
        <p>You can close this window and return to your terminal.</p>
        <script>setTimeout(() => window.close(), 2000)</script>
      </body>
    </html>
  `
  const ERROR_HTML = (error: string) => `
    <html>
      <head><title>Authentication Failed</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>✗ Authentication Failed</h1>
        <p>${error}</p>
        <p>Please close this window and try again.</p>
      </body>
    </html>
  `

  export interface OAuthFlowResult {
    access_token: string
    refresh_token?: string
    expiry_date?: number
    email?: string
  }

  async function getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.listen(0, () => {
        const address = server.address()
        const port = typeof address === "object" && address ? address.port : 0
        server.close(() => resolve(port))
      })
      server.on("error", reject)
    })
  }

  export async function startAuthFlow(): Promise<{
    url: string
    method: "auto" | "code"
    complete: () => Promise<OAuthFlowResult>
  }> {
    const client = new OAuth2Client({
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
    })

    const port = await getAvailablePort()
    const redirectUri = `http://127.0.0.1:${port}${REDIRECT_PATH}`
    const state = crypto.randomBytes(32).toString("hex")

    const authUrl = client.generateAuthUrl({
      redirect_uri: redirectUri,
      access_type: "offline",
      scope: OAUTH_SCOPES,
      state,
      prompt: "consent",
    })

    const complete = () =>
      new Promise<OAuthFlowResult>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          server.close()
          reject(new Error("OAuth authentication timed out after 5 minutes"))
        }, AUTH_TIMEOUT)

        const server = http.createServer(async (req, res) => {
          try {
            if (!req.url?.includes(REDIRECT_PATH)) {
              res.writeHead(400, { "Content-Type": "text/html" })
              res.end(ERROR_HTML("Invalid callback URL"))
              return
            }

            const qs = new URL(req.url, `http://127.0.0.1:${port}`).searchParams

            if (qs.get("error")) {
              const error = qs.get("error")
              const description = qs.get("error_description") || "No details provided"
              res.writeHead(400, { "Content-Type": "text/html" })
              res.end(ERROR_HTML(`${error}: ${description}`))
              clearTimeout(timeoutId)
              server.close()
              reject(new Error(`OAuth error: ${error} - ${description}`))
              return
            }

            if (qs.get("state") !== state) {
              res.writeHead(400, { "Content-Type": "text/html" })
              res.end(ERROR_HTML("State mismatch - possible CSRF attack"))
              clearTimeout(timeoutId)
              server.close()
              reject(new Error("OAuth state mismatch"))
              return
            }

            const code = qs.get("code")
            if (!code) {
              res.writeHead(400, { "Content-Type": "text/html" })
              res.end(ERROR_HTML("No authorization code received"))
              clearTimeout(timeoutId)
              server.close()
              reject(new Error("No authorization code"))
              return
            }

            const { tokens } = await client.getToken({
              code,
              redirect_uri: redirectUri,
            })

            client.setCredentials(tokens)

            let email: string | undefined
            try {
              const { token } = await client.getAccessToken()
              if (token) {
                const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                  headers: { Authorization: `Bearer ${token}` },
                })
                if (response.ok) {
                  const userInfo = (await response.json()) as { email?: string }
                  email = userInfo.email
                }
              }
            } catch (err) {
              console.warn("Failed to fetch user info:", err)
            }

            res.writeHead(200, { "Content-Type": "text/html" })
            res.end(SUCCESS_HTML)

            clearTimeout(timeoutId)
            server.close()

            resolve({
              access_token: tokens.access_token!,
              refresh_token: tokens.refresh_token ?? undefined,
              expiry_date: tokens.expiry_date ?? undefined,
              email,
            })
          } catch (error) {
            res.writeHead(500, { "Content-Type": "text/html" })
            res.end(ERROR_HTML("Internal server error"))
            clearTimeout(timeoutId)
            server.close()
            reject(error)
          }
        })

        server.listen(port, "127.0.0.1", () => {
          console.log(`OAuth callback server listening on port ${port}`)
        })

        server.on("error", (err) => {
          clearTimeout(timeoutId)
          reject(err)
        })
      })

    return {
      url: authUrl,
      method: "auto",
      complete,
    }
  }

  export async function refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string; expiry_date?: number }> {
    const client = new OAuth2Client({
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
    })

    client.setCredentials({ refresh_token: refreshToken })
    const { credentials } = await client.refreshAccessToken()

    return {
      access_token: credentials.access_token!,
      expiry_date: credentials.expiry_date ?? undefined,
    }
  }

  export async function validateToken(accessToken: string): Promise<boolean> {
    try {
      const client = new OAuth2Client({
        clientId: OAUTH_CLIENT_ID,
        clientSecret: OAUTH_CLIENT_SECRET,
      })

      await client.getTokenInfo(accessToken)
      return true
    } catch {
      return false
    }
  }
}
