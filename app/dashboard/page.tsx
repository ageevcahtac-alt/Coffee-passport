export default function DashboardOverviewPage() {
  return (
    <div className="max-w-3xl">
      <p className="section-label mb-4">Overview</p>
      <p className="text-ink-500 text-sm">
        Scan counts, reviews, average rating, and flavor feedback land here in step 13
        (roaster dashboard analytics). Auth + membership gating is wired — this page just
        needs real queries against <span className="data-value">qr_codes</span>,{' '}
        <span className="data-value">reviews</span>, and{' '}
        <span className="data-value">review_flavors</span>.
      </p>
    </div>
  );
}