import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/components/cospharm/roles";
import type { Role } from "@/components/cospharm/types";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export default defineTool({
  name: "describe_role",
  title: "Describe a role",
  description:
    "Describe what a Cospharm dashboard role can do. Omit the role to list every available role key.",
  inputSchema: {
    role: z.string().trim().optional().describe("Role key, e.g. warehouse_checker. Omit to list all roles."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ role }) => {
    if (!role) {
      return {
        content: [
          { type: "text" as const, text: ROLES.map((r) => `${r} — ${ROLE_LABEL[r]}`).join("\n") },
        ],
        structuredContent: { roles: ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] })) },
      };
    }
    const key = role as Role;
    if (!ROLES.includes(key)) {
      throw new ToolError(`Unknown role "${role}". Known roles: ${ROLES.join(", ")}`);
    }
    return {
      content: [{ type: "text" as const, text: `${ROLE_LABEL[key]} — ${ROLE_DESCRIPTION[key]}` }],
      structuredContent: { key, label: ROLE_LABEL[key], description: ROLE_DESCRIPTION[key] },
    };
  },
});