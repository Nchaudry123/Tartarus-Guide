import type { ComponentPropsWithoutRef } from "react";

type SuggestionButtonProps = ComponentPropsWithoutRef<"button"> & {
  label: string;
};

export function SuggestionButton({ label, className = "", ...props }: SuggestionButtonProps) {
  return (
    <button
      className={`group relative overflow-hidden bg-white px-4 py-3 text-left font-display text-sm italic text-navy-950 shadow-slash transition duration-200 [clip-path:polygon(0_0,96%_0,100%_28%,94%_100%,0_100%)] hover:-translate-y-1 hover:bg-persona-ice focus:outline-none focus:ring-2 focus:ring-persona-cyan ${className}`}
      type="button"
      {...props}
    >
      <span className="absolute inset-y-0 left-0 w-1.5 bg-persona-cyan transition group-hover:w-3" />
      <span className="relative ml-2 block tracking-wide">{label}</span>
    </button>
  );
}
