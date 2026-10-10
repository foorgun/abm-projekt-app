import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Button-Familie (docs/design-v2.md): primary hell, secondary dunkelgrau gefüllt, outline, ghost, destructive korallrot. */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon links vom Text */
  icon?: ReactNode;
  /** Icon rechts vom Text (z. B. Pfeil bei Primäraktionen) */
  iconRight?: ReactNode;
}

export function buttonClass(variant: ButtonVariant = "outline", size: ButtonSize = "md", extra?: string) {
  return ["btn", `btn-${variant}`, size !== "md" && `btn-${size}`, extra].filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "outline", size = "md", icon, iconRight, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Pflicht: Icon-Buttons brauchen einen zugänglichen Namen. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={buttonClass(variant, size, ["btn-icon", className].filter(Boolean).join(" "))} {...rest}>
      {children}
    </button>
  );
});
