import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { STAFF_ROSTER } from "@/components/cospharm/staff";
import { ROLE_LABEL } from "@/components/cospharm/roles";

export default defineTool({
  name: "list_staff",
  title: "List staff roster",
  description: "List the Cospharm staff roster with job title, operational role and shift, optionally filtered by shift.",
  inputSchema: {
    shift: z.enum(["Morning", "Afternoon", "Night", "All-day"]).optional().describe("Optional shift filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ shift }) => {
    const staff = STAFF_ROSTER.filter((s) => !shift || s.shift === shift).map((s) => ({
      name: s.name,
      title: s.title,
      role: ROLE_LABEL[s.role],
      shift: s.shift ?? "Unspecified",
    }));
    return {
      content: [
        {
          type: "text" as const,
          text:
            staff.length === 0
              ? "No staff match that shift."
              : staff.map((s) => `${s.name} — ${s.title} (${s.role}) — ${s.shift}`).join("\n"),
        },
      ],
      structuredContent: { staff },
    };
  },
});