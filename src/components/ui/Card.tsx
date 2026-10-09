import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </section>
  );
}

export function CardHead({ title, sub, icon, actions }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="card-head">
      <div>
        <h2 className="card-title">
          {icon}
          {title}
        </h2>
        {sub && <p className="card-sub">{sub}</p>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </header>
  );
}

export function CardBody({ flush, children }: { flush?: boolean; children: ReactNode }) {
  return <div className={flush ? "card-body flush" : "card-body"}>{children}</div>;
}
