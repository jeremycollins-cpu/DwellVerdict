import * as React from "react";

import { cn } from "@/lib/utils";
import { contactRoleGradients } from "@/lib/brand-tokens";

/**
 * Circular avatar primitive with initials fallback or image.
 *
 * The `role` variant uses gradient backgrounds for contact roles in the
 * mockup #14 contacts grid (agent / lender / inspector / title). The default
 * variant uses an ink gradient.
 */

export type AvatarSize = "sm" | "md" | "lg" | "xl";
export type AvatarRole = "agent" | "lender" | "inspector" | "title";

export interface AvatarProps {
  initials?: string;
  imageUrl?: string;
  alt?: string;
  size?: AvatarSize;
  variant?: "default" | "role";
  role?: AvatarRole;
  className?: string;
}

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "size-6 text-[10px]",
  md: "size-[30px] text-[11px]",
  lg: "size-10 text-sm",
  xl: "size-16 text-xl",
};

export function Avatar({
  initials,
  imageUrl,
  alt,
  size = "md",
  variant = "default",
  role,
  className,
}: AvatarProps) {
  const gradient =
    variant === "role" && role
      ? contactRoleGradients[role]
      : contactRoleGradients.default;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium uppercase tracking-tight text-paper",
        SIZE_CLASS[size],
        className,
      )}
      style={imageUrl ? undefined : { backgroundImage: gradient }}
      aria-label={imageUrl ? alt : undefined}
      role={imageUrl ? "img" : undefined}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={alt ?? ""}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
