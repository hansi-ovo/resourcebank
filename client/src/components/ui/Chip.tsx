import { cn } from '@/lib/utils';
import { CATEGORIES, type CategoryId } from 'shared/types';

/** Category chip: 10% cat tint bg, cat-color text, pill (design doc §5). */
export function CatChip({ category, variant = 'text' }: { category: CategoryId; variant?: 'text' | 'solid' }) {
  const meta = CATEGORIES.find((c) => c.id === category)!;
  return (
    <span
      data-cat={category}
      className={cn('chip-cat', variant === 'text' && 'chip-cat-100')}
      style={{ ['--cat' as string]: meta.tint }}
    >
      {meta.label}
    </span>
  );
}

/** Audience tag chip (shared shape, neutral ink tint). */
export function TagChip({ children }: { children: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-[10px] py-[2px] text-[13px] font-semibold"
      style={{
        background: 'color-mix(in oklab, var(--ink) 7%, white)',
        color: 'var(--ink-soft)',
      }}
    >
      {children}
    </span>
  );
}
