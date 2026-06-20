import clsx from 'clsx';

interface ChipSelectorProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  columns?: number;
  className?: string;
}

export default function ChipSelector({
  options,
  value,
  onChange,
  label,
  columns,
  className,
}: ChipSelectorProps) {
  const isGrid = columns && columns > 0;

  return (
    <div className={clsx('space-y-2', className)}>
      {label && (
        <label className="text-[11px] font-medium text-muted-foreground block">
          {label}
        </label>
      )}
      <div
        className={clsx(
          isGrid ? 'grid gap-2' : 'flex gap-2 overflow-x-auto no-scrollbar pb-1',
        )}
        style={isGrid ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(selected ? '' : opt)}
              className={clsx(
                'tap-target px-3 py-2 rounded-xl text-[13px] font-semibold transition-all border shrink-0',
                selected
                  ? 'bg-foreground text-background border-foreground shadow-sm scale-[0.98]'
                  : 'bg-secondary/50 text-foreground border-border hover:border-foreground hover:bg-secondary/80',
                isGrid && 'text-center',
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
