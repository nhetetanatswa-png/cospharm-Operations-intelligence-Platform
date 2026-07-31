import { defineTool } from "@lovable.dev/mcp-js";
import { OPERATION_STEPS } from "@/components/cospharm/operations";
import { STEP_DEPARTMENT, STEP_TARGET_MINUTES } from "@/components/cospharm/delivery-timing";
import { ROLE_LABEL } from "@/components/cospharm/roles";

export default defineTool({
  name: "list_workflow_steps",
  title: "List delivery workflow steps",
  description:
    "List the 7-step timed Cospharm delivery workflow with each step's owning department, target time in minutes, and the roles allowed to complete it.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const steps = OPERATION_STEPS.map((s) => ({
      stepNumber: s.stepNumber,
      name: s.name,
      department: STEP_DEPARTMENT[s.stepNumber],
      targetMinutes: STEP_TARGET_MINUTES[s.stepNumber],
      allowedRoles: s.allowedRoles.map((r) => ROLE_LABEL[r]),
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: steps
            .map(
              (s) =>
                `${s.stepNumber}. ${s.name} — ${s.department}, target ${s.targetMinutes}m, roles: ${s.allowedRoles.join(", ")}`,
            )
            .join("\n"),
        },
      ],
      structuredContent: { steps },
    };
  },
});