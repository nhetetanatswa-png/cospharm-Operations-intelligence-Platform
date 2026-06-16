import { Check, Lock } from "lucide-react";
import { getCompletedSteps, getCurrentStep, getGradientStatus, getProgressPercentage } from "./operations";
import type { OperationStep } from "./types";

export function DeliveryProgress({ steps, showLabels = true }: { steps: OperationStep[]; showLabels?: boolean }) {
  const completed = getCompletedSteps(steps);
  const pct = getProgressPercentage(steps);
  const gradient = getGradientStatus(steps);
  const current = getCurrentStep(steps);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${gradient.tone}`}>
            {completed === 7 ? <Check className="size-3" /> : <Lock className="size-3" />}
            {gradient.label}
          </span>
          <span className="text-muted-foreground">
            {completed}/7 steps · {pct}%
          </span>
        </div>
        {showLabels ? (
          <span className="truncate text-muted-foreground">
            {completed === 7 ? "All steps complete" : `Next: ${current.name}`}
          </span>
        ) : null}
      </div>
      <div className="flex gap-1">
        {steps.map((s) => (
          <div
            key={s.stepNumber}
            title={`Step ${s.stepNumber}: ${s.name}`}
            className={`h-2 flex-1 rounded ${stepTone(s.stepNumber, completed)}`}
          />
        ))}
      </div>
    </div>
  );
}

function stepTone(stepNumber: number, completed: number) {
  if (stepNumber > completed) return "bg-secondary";
  // Gradient from red → green by step
  const tones = [
    "bg-red-600",
    "bg-orange-500",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-lime-400",
    "bg-green-400",
    "bg-green-600",
  ];
  return tones[stepNumber - 1];
}