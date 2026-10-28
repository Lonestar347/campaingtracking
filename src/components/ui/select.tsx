import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClassName } from "@/components/ui/input";

/** Native select styled like the other inputs (keyboard and mobile friendly). */
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(inputClassName, "pr-8", className)} {...props} />;
}
