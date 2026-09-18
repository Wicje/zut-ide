import * as React from "react"
import { cn } from "cn"

function TextareaBase(
  { className, ...props }: React.ComponentProps<"textarea">,
  ref: React.ForwardedRef<HTMLTextAreaElement>,
) {
  return (
    <textarea
      data-slot="textarea"
      ref={ref}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

// forwardRef: audit completeness — no current ref callers, but a textarea
// without ref support is a trap waiting to happen (see button.tsx).
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(TextareaBase)

export { Textarea }
