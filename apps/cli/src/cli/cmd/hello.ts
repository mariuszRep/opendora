import type { Argv } from "yargs"
import { cmd } from "./cmd"

export const HelloCommand = cmd({
  command: "hello [name]",
  describe: "Print a friendly greeting message",
  builder: (yargs: Argv) => {
    return yargs.positional("name", {
      describe: "Name to greet (optional, defaults to 'World')",
      type: "string",
      default: "World",
    })
  },
  handler: async (args) => {
    const name = args.name
    // Handle empty string - default to "World"
    const greetingName = !name || name.trim() === "" ? "World" : name

    // Build the greeting
    let greeting = `Hello, ${greetingName}!`

    // Apply uppercase if flag is set
    if (args.uppercase) {
      greeting = greeting.toUpperCase()
    }

    console.log(greeting)
  },
})
