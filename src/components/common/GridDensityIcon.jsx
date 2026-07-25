export default function GridDensityIcon({ level }) {
  const squareSize = [7, 5.5, 4][level] ?? 7;
  const gapSize = [3, 2.5, 2][level] ?? 3;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(2, ${squareSize}px)`,
        gridTemplateRows: `repeat(2, ${squareSize}px)`,
        gap: `${gapSize}px`,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ background: '#facc15', borderRadius: '1px' }} />
      ))}
    </div>
  );
}
