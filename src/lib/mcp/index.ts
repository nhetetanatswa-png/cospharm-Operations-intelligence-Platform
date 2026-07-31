import { defineMcp } from "@lovable.dev/mcp-js";
import searchCustomers from "./tools/search-customers";
import listWorkflowSteps from "./tools/list-workflow-steps";
import listStaff from "./tools/list-staff";
import describeRole from "./tools/describe-role";

export default defineMcp({
  name: "cospharm-status-light",
  title: "Cospharm Status Light",
  version: "0.1.0",
  instructions:
    "Reference tools for the Cospharm Operations & Intelligence Dashboard. Use `search_customers` for the customer/distributor directory, `list_workflow_steps` for the 7-step timed delivery workflow and its targets, `list_staff` for the staff roster, and `describe_role` for role permissions.",
  tools: [searchCustomers, listWorkflowSteps, listStaff, describeRole],
});