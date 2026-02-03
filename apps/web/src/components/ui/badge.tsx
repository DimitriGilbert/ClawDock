import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-none border px-1.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-transparent",
        secondary:
          "bg-secondary text-secondary-foreground border-transparent",
        destructive:
          "bg-destructive/10 text-destructive border-destructive/20 dark:bg-destructive/20",
        outline:
          "text-foreground border-border bg-background",
        success:
          "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
        warning:
          "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
        info:
          "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
