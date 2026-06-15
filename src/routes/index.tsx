import { createFileRoute } from "@tanstack/react-router";
import { CospharmDashboard } from "@/components/cospharm/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cospharm Operations — Tasks & Stock Dashboard" },
      { name: "description", content: "Live traffic-light dashboard for Cospharm staff and supervisors to track daily tasks, stock health, and operational risks." },
      { property: "og:title", content: "Cospharm Operations Dashboard" },
      { property: "og:description", content: "Traffic-light monitoring for daily tasks and stock condition." },
    ],
  }),
  component: Index,
});

function Index() {
  return <CospharmDashboard />;
}
