import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ALL_CLIENT_RECORDS } from "@/components/cospharm/mockClients";

export default defineTool({
  name: "search_customers",
  title: "Search customers",
  description:
    "Search Cospharm's customer, clinic, pharmacy and distributor directory by name, optionally filtered by type.",
  inputSchema: {
    query: z.string().trim().default("").describe("Case-insensitive name fragment. Empty returns all."),
    type: z
      .enum(["Distributor", "Hospital", "Pharmacy", "Retail Chain", "Other"])
      .optional()
      .describe("Optional customer type filter."),
    limit: z.number().int().min(1).max(200).default(25).describe("Maximum records to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, type, limit }) => {
    const q = query.toLowerCase();
    const matches = ALL_CLIENT_RECORDS.filter(
      (c) => (!type || c.type === type) && (!q || c.name.toLowerCase().includes(q)),
    );
    const results = matches.slice(0, limit);
    return {
      content: [
        {
          type: "text" as const,
          text:
            results.length === 0
              ? "No matching customers."
              : results.map((c) => `${c.name} — ${c.type}${c.phone ? ` — ${c.phone}` : ""}`).join("\n"),
        },
      ],
      structuredContent: { total: matches.length, returned: results.length, results },
    };
  },
});