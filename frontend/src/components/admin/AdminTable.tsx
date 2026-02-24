import type { ReactNode } from 'react'

type AdminTableProps = {
  headers: string[]
  children: ReactNode
}

export default function AdminTable({ headers, children }: AdminTableProps) {
  return (
    <div className="adminTableWrap">
      <table className="adminTable">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
