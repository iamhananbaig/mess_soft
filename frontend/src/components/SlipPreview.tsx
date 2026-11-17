import { useMemo } from 'react';
import { interpretEscPos, type PreviewRun } from '@/lib/escposPreview';
import { cn } from '@/lib/utils';

/** Font A is 12 dots wide, Font B 9: a run in the other font scales relative to the body. */
const FONT_SCALE = { A: 12, B: 9 } as const;

function runStyle(run: PreviewRun, bodyFont: 'A' | 'B'): React.CSSProperties | undefined {
  const scale = FONT_SCALE[run.font] / FONT_SCALE[bodyFont];
  if (scale === 1 && run.w === 1 && run.h === 1) return undefined;
  // Glyphs grow with font size (scale × height); letter spacing adds the extra
  // width of double-width text, in the run's own `ch` units.
  return {
    fontSize: `${scale * run.h}em`,
    letterSpacing: run.w !== run.h ? `${(run.w - run.h) / run.h}ch` : undefined,
    lineHeight: 1.2,
  };
}

/**
 * Renders ESC/POS bytes as they will look on thermal paper. Uses the exact
 * bytes sent to the printer, so the preview cannot drift from the print.
 */
export function SlipPreview({ bytes, className }: { bytes: Uint8Array; className?: string }) {
  const model = useMemo(() => interpretEscPos(bytes), [bytes]);

  return (
    <div
      className={cn('mx-auto shrink-0 rounded-sm bg-white text-black shadow-md ring-1 ring-black/10 px-3 py-4 font-mono leading-[1.35]', className)}
      // Font A (12-dot) is ~1.33× wider than Font B (9-dot): keep the paper the same width.
      style={{ width: `calc(${model.columns}ch + 1.5rem)`, fontSize: model.font === 'A' ? '12.5px' : '11px' }}
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
                style={runStyle(run, model.font)}
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
