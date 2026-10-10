import type { ReactNode } from "react";

/**
 * Listen-/Einstellungszeile (Design v2): Icon-Kachel links, Titel + Beschreibung, Aktion rechts (kleiner Button oder Schalter).
 * `card` macht daraus eine eigene Karte; sonst als Zeile innerhalb einer Karte (getrennt durch feine Linien).
 */
export function SettingRow({
  icon,
  title,
  description,
  action,
  card,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  card?: boolean;
  /** Aufklappbarer Inhalt unter der Zeile (z. B. Editor) */
  children?: ReactNode;
}) {
  return (
    <div className={card ? "setting-row setting-card" : "setting-row"}>
      <div className="setting-main">
        <span className="setting-icon" aria-hidden>
          {icon}
        </span>
        <div className="setting-text">
          <span className="setting-title">{title}</span>
          {description && <span className="setting-desc">{description}</span>}
        </div>
        {action && <div className="setting-action">{action}</div>}
      </div>
      {children && <div className="setting-body">{children}</div>}
    </div>
  );
}
