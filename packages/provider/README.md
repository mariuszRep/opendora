# @opendora/provider

AI provider and model access for OpenDora runtime execution.

## Provider Authentication

### Adding Provider Credentials

From the OpenDora repository root:

```bash
bun run dev auth login
```

This will:
1. Show a list of available providers
2. Prompt you to select a provider
3. Ask for your API key
4. Store it securely in `.opendora/auth.json`

### Alternative Methods

#### Environment Variable

```bash
export PROVIDER_API_KEY="your-api-key-here"
```

#### Configuration File

Add to `.opendora/opendora.json`:

```json
{
  "provider": {
    "provider-name": {
      "options": {
        "apiKey": "your-api-key-here"
      }
    }
  }
}
```

### Managing Credentials

#### List stored credentials
```bash
bun run dev auth list
```

#### Remove credentials
```bash
bun run dev auth logout <provider-name>
```

## See also

- [VISION.md](./VISION.md) — package vision and boundaries
- [AGENTS.md](./AGENTS.md) — agent working instructions
