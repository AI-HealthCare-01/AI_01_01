type StatCardProps = {
  label: string
  value: number
}

export default function StatCard({ label, value }: StatCardProps) {
  return (
    <article className="adminStatCard">
      <p className="adminStatLabel">{label}</p>
      <strong className="adminStatValue">{value.toLocaleString()}</strong>
    </article>
  )
}
