import React from 'react';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface MetaFieldProps {
  label: string;
  value: React.ReactNode;
  className?: string;
  valueClassName?: string;
}

/** 입고 / 주차 / 고객 메타와 동일 톤 — 라벨 zinc-500, 값 zinc-300 */
export default function MetaField({
  label,
  value,
  className,
  valueClassName,
}: MetaFieldProps) {
  return (
    <div className={cn('text-[13px]', className)}>
      <span className="text-zinc-500">{label}: </span>
      <span className={cn('text-zinc-300', valueClassName)}>{value}</span>
    </div>
  );
}
