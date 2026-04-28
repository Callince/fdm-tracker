import type { ReactNode } from "react";
import { Card, CardBody } from "@/components/ui/card";

interface Props {
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "active" | "idle" | "brk";
  icon?: ReactNode;
}

const accents = {
  default: "text-slate-900 dark:text-slate-100",
  active: "text-active",
  idle: "text-idle",
  brk: "text-brk",
};

export function StatCard({ label, value, hint, accent = "default", icon }: Props) {
  return (
    <Card>
      <CardBody className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
          <div className={`text-2xl font-semibold mt-1 ${accents[accent]}`}>{value}</div>
          {hint && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hint}</div>}
        </div>
        {icon && <div className="text-slate-300 dark:text-slate-600">{icon}</div>}
      </CardBody>
    </Card>
  );
}
