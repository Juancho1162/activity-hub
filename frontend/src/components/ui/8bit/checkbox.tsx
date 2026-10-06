// 8bitcn (MIT); source: https://www.8bitcn.com/r/checkbox.json
// Local integration details and licenses: frontend/THIRD_PARTY_NOTICES.md
import type * as React from "react";

import type { Checkbox as CheckboxPrimitive } from "radix-ui";
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Checkbox as ShadcnCheckbox } from "@/components/ui/checkbox";

import "@/components/ui/8bit/styles/retro.css";

export const checkboxVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "retro",
  },
});

export interface BitCheckboxProps
  extends React.ComponentProps<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {
  asChild?: boolean;
}

function Checkbox({ className, font, ...props }: BitCheckboxProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center border-y-2 border-ring",
        className
      )}
    >
      <ShadcnCheckbox
        className={cn(
          "rounded-none size-5 ring-0 border-none",
          font !== "normal" && "retro",
          className
        )}
        {...props}
      />

      <div
        className="absolute inset-0 border-x-2 -mx-0.5 border-ring pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

export { Checkbox };
