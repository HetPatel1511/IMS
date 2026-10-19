export function SkeletonRows({ rows = 4, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="skeleton-row" aria-hidden>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <span className="skeleton-cell" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
