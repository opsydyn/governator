/** @jsxRuntime classic */
import React from "react";

export function StatusBadge({
  children,
  tone = "neutral",
  description,
}: {
  children: React.ReactNode;
  tone?: "success" | "danger" | "warning" | "neutral" | "accent";
  description?: string;
}) {
  return (
    <span className="gn-status-badge" data-tone={tone} title={description}>
      {children}
    </span>
  );
}
