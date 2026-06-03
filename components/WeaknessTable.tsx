import type { ChatTable } from "../lib/types";

export function WeaknessTable({ table }: { table: ChatTable }) {
  return (
    <div className="overflow-hidden border-2 border-navy-950 bg-white text-navy-950 shadow-[6px_7px_0_rgba(2,7,32,0.22)]">
      <div className="bg-navy-950 px-4 py-2 font-display text-sm italic uppercase tracking-wide text-persona-cyan">
        {table.title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="bg-persona-ice">
              {table.columns.map((column) => (
                <th key={column} className="border-b border-navy-950/20 px-3 py-2 text-left font-black">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`${row.join("-")}-${rowIndex}`} className={rowIndex % 2 ? "bg-blue-50" : "bg-white"}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className="border-b border-navy-950/10 px-3 py-2 font-semibold">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
