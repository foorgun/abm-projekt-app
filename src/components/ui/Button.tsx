import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "default" | "primary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "sm";
  icon?: ReactNode;
}

function cls(variant: Variant, size: "md" | "sm", extra?: string) {
  return ["btn", variant !== "default" && `btn-${variant}`, size === "sm" && "btn-sm", extra].filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cls(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Pflicht: Icon-Buttons brauchen einen zugänglichen Namen. */
  label: string;
  variant?: Variant;
  size?: "md" | "sm";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cls(variant, size, ["btn-icon", className].filter(Boolean).join(" "))}
      {...rest}
    >
      {children}
    </button>
  );
});
