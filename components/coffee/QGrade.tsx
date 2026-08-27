// Reuses the .q-seal styling introduced on the landing page hero — same
// stamp, same rotation, same restrained gold. This is the one place in the
// product gold appears at full saturation.
export function QGrade({ value }: { value: number }) {
  return (
    <div className="q-seal" aria-hidden="true">
      <span className="q-seal-value">{value.toFixed(1)}</span>
      <span className="q-seal-label">Q-Score</span>
    </div>
  );
}
