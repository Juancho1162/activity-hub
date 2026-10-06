// 8bitcn (MIT); source: https://www.8bitcn.com/r/input.json
// Local integration details and licenses: frontend/THIRD_PARTY_NOTICES.md
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Input as ShadcnInput } from "@/components/ui/input";

import "@/components/ui/8bit/styles/retro.css";

export const inputVariants = cva("", {
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

export interface BitInputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  asChild?: boolean;
}

function Input({ className, font, ...props }: BitInputProps) {

  return (
    <div
      className={cn(
        "relative border-y-2 border-ring !p-0 flex items-center",
        className
      )}
    >
      <ShadcnInput
        {...props}
        className={cn(
          "rounded-none ring-0 !w-full",
          font !== "normal" && "retro",
          className
        )}
      />

      <div
        className="absolute inset-0 border-x-2 -mx-0.5 border-ring pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

export { Input };
