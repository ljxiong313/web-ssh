import React from "react"
import { cn } from "@/lib/utils"

// Simple text wrapper for compatibility with existing code
export const Text = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, ...props }, ref) => (
    <span ref={ref} className={cn("", className)} {...props}>
      {children}
    </span>
  )
)
Text.displayName = "Text"

export default Text
