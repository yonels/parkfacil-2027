export default function DataTable({ columns = [], rows = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            {columns.map((column) => (
              <th key={column.key} className="px-2 py-2 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.id || "row"}-${index}`} className="border-b border-slate-100 last:border-0">
              {columns.map((column) => (
                <td key={`${column.key}-${row.id || index}`} className="px-2 py-2 text-slate-600">
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
