import z from "zod"

export const RegistrationSchema = z
  .object({
    email: z.string().email("Invalid email format"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .refine(
        (password) => /[A-Z]/.test(password),
        "Password must contain at least one uppercase letter",
      )
      .refine(
        (password) => /[a-z]/.test(password),
        "Password must contain at least one lowercase letter",
      )
      .refine((password) => /\d/.test(password), "Password must contain at least one number"),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  })

export type RegistrationInput = z.infer<typeof RegistrationSchema>

export function validateRegistration(data: unknown) {
  return RegistrationSchema.safeParse(data)
}
