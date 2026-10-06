// 8bitcn (MIT); source: https://www.8bitcn.com/r/card.json
// Local integration details and licenses: frontend/THIRD_PARTY_NOTICES.md
import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import {
  Card as ShadcnCard,
  CardAction as ShadcnCardAction,
  CardContent as ShadcnCardContent,
  CardDescription as ShadcnCardDescription,
  CardFooter as ShadcnCardFooter,
  CardHeader as ShadcnCardHeader,
  CardTitle as ShadcnCardTitle,
} from "@/components/ui/card";

import "@/components/ui/8bit/styles/retro.css";

export const cardVariants = cva("", {
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

export interface BitCardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

function Card({ className, font, ...props }: BitCardProps) {
  return (
    <div
      data-slot="bit-card"
      className={cn(
        "relative bg-card text-card-foreground border-y-2 border-border p-0!",
        className
      )}
    >
      <ShadcnCard
        {...props}
        className={cn(
          "rounded-none border-0 w-full! h-full flex flex-col bg-card text-card-foreground shadow-none",
          font !== "normal" && "retro"
        )}
      />

      <div
        className={cn("absolute inset-0 border-x-2 -mx-0.5 border-inherit pointer-events-none")}
        aria-hidden="true"
      />
    </div>
  );
}

function CardHeader({ className, font, ...props }: BitCardProps) {

  return (
    <ShadcnCardHeader
      className={cn(font !== "normal" && "retro", className)}
      {...props}
    />
  );
}

function CardTitle({ className, font, ...props }: BitCardProps) {

  return (
    <ShadcnCardTitle
      className={cn(font !== "normal" && "retro", className)}
      {...props}
    />
  );
}

function CardDescription({ className, font, ...props }: BitCardProps) {

  return (
    <ShadcnCardDescription
      className={cn(font !== "normal" && "retro", className)}
      {...props}
    />
  );
}

function CardAction({ className, font, ...props }: BitCardProps) {

  return (
    <ShadcnCardAction
      className={cn(font !== "normal" && "retro", className)}
      {...props}
    />
  );
}

function CardContent({ className, font, ...props }: BitCardProps) {

  return (
    <ShadcnCardContent
      className={cn("flex-1", font !== "normal" && "retro", className)}
      {...props}
    />
  );
}

function CardFooter({ className, font, ...props }: BitCardProps) {

  return (
    <ShadcnCardFooter
      data-slot="card-footer"
      className={cn(font !== "normal" && "retro", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
