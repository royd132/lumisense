import type React from "react";

export default function SectionHead({ eyebrow, title, extra }: { eyebrow: string; title: string; extra?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {extra}
    </div>
  );
}
