import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const JavaRuntimeInputSchema = z
  .object({
    operation: z.enum(["list", "register", "select", "clearSelection", "forget"]),
    path: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Required for register, select and forget; clearSelection acts on the current project without a path",
      ),
    purpose: z.enum(["project", "build"]).optional(),
  })
  .strict();
export type JavaRuntimeInput = z.infer<typeof JavaRuntimeInputSchema>;
export const JavaRuntimeOutputSchema = z
  .object({
    status: z.enum(["ready", "saved", "needs_user_input", "disabled", "failed"]),
    message: z.string(),
    candidates: z
      .array(
        z
          .object({
            path: z.string(),
            version: z.string(),
            major: z.number().int(),
            vendor: z.string().optional(),
            sources: z.array(z.string()),
          })
          .strict(),
      )
      .optional(),
    issues: z.array(z.object({ path: z.string(), message: z.string() }).strict()).optional(),
  })
  .strict();
export type JavaRuntimeOutput = z.infer<typeof JavaRuntimeOutputSchema>;
export const JavaRuntimeInputJsonSchema = toToolJsonSchema(JavaRuntimeInputSchema);
export const JavaRuntimeOutputJsonSchema = toToolJsonSchema(JavaRuntimeOutputSchema);
