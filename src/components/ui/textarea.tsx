import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClassName } from "@/components/ui/input";

export function Textarea({ className, rows = 3, ...props }: React.ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(inputClassName, "h-auto min-h-16 py-2", className)} {...props} />;
}
