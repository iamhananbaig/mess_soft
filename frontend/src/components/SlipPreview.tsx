import { useMemo } from 'react';
import { interpretEscPos } from '@/lib/escposPreview';
import { cn } from '@/lib/utils';

/**
 * Renders ESC/POS bytes as they will look on thermal paper. Uses the exact
 * bytes sent to the printer, so the preview cannot drift from the print.
 */
export function SlipPreview({ bytes, className }: { bytes: Uint8Array; className?: string }) {
  const model = useMemo(() => interpretEscPos(bytes), [bytes]);

  return (
    <div
      className={cn('rounded-sm bg-white text-black shadow-md ring-1 ring-black/10 px-3 py-4 font-mono text-[11px] leading-[1.35]', className)}
      style={{ width: `calc(${model.columns}ch + 1.5rem)` }}
      aria-label="Receipt preview"
    >
      {model.lines.map((line, i) =>
        line.kind === 'cut' ? (
          <div key={i} className="my-3 -mx-3 border-t-2 border-dashed border-black/40 text-center text-[9px] text-black/50">✂ cut</div>
        ) : (
          <div key={i} className="whitespace-pre-wrap break-all" style={{ textAlign: line.align, minHeight: '1.35em' }}>
            {line.runs.map((run, j) => (
              <span
                key={j}
                className={run.bold ? 'font-bold' : undefined}
                style={run.w > 1 || run.h > 1 ? { fontSize: `${run.h}em`, letterSpacing: `${run.w - run.h}ch`, lineHeight: 1.2 } : undefined}
              >
                {run.text}
              </span>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
