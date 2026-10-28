import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-white hover:opacity-90 shadow-sm",
        destructive:
          "bg-[var(--danger)] text-white hover:opacity-90 shadow-sm",
        outline:
          "border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--border)]",
        secondary:
          "bg-[var(--border)] text-[var(--fg)] hover:opacity-80",
        ghost:
          "hover:bg-[var(--border)] text-[var(--fg)]",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 text-sm",
        sm: "h-7 rounded px-2.5 text-xs",
        lg: "h-10 rounded-md px-6 text-base",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
