import * as React from "react"

import { cn } from "@/lib/utils"

// The shell only. shadcn's card ships a header, title, description, action,
// content and footer alongside it; this theme lays out its cards itself, so all
// six were unused from the moment they were vendored. Restore one from upstream
// if a card ever needs it.
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "glass-panel flex flex-col gap-6 rounded-2xl py-6 text-card-foreground transition-[background-color,border-color,transform]",
        className
      )}
      {...props}
    />
  )
}

export { Card }
