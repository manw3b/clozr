interface SkeletonProps {
  width?: string | number;
  height?: number;
  radius?: number;
}

export function Skeleton({ width = "100%", height = 14, radius = 6 }: SkeletonProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: "var(--surface-2)",
        backgroundImage:
          "linear-gradient(90deg,var(--surface-2) 0%,var(--surface-3) 50%,var(--surface-2) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s ease-in-out infinite",
      }}
    />
  );
}

export function CardSkeleton() {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <Skeleton width={40} height={40} radius={20} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="35%" height={11} />
      </div>
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Skeleton width="40%" height={11} />
      <Skeleton width="60%" height={22} />
    </div>
  );
}
