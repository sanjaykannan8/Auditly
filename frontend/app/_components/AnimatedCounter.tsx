'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'

/**
 * Counts up from 0 to `value` with a smooth ease.
 * Renders a plain <span> — drop it in place of a raw number.
 */
export default function AnimatedCounter({
  value,
  className,
  suffix = '',
}: {
  value: number
  className?: string
  suffix?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || isNaN(value)) return

    const obj = { val: 0 }
    const ctx = gsap.context(() => {
      gsap.to(obj, {
        val: value,
        duration: 1.1,
        ease: 'power2.out',
        delay: 0.1,
        onUpdate() {
          el.textContent = String(Math.round(obj.val)) + suffix
        },
      })
    })

    return () => ctx.revert()
  }, [value, suffix])

  return (
    <span ref={ref} className={className}>
      0{suffix}
    </span>
  )
}
