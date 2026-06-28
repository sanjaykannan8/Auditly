'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'

/**
 * Stagger-animates direct children on mount (fade + slide up).
 * Use as a wrapper around lists of cards / rows.
 */
export default function StaggerList({
  children,
  className,
  stagger = 0.07,
  delay = 0.1,
}: {
  children: React.ReactNode
  className?: string
  stagger?: number
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const items = el.children
    if (!items.length) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        Array.from(items),
        { opacity: 0, y: 22 },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power2.out',
          stagger,
          delay,
          clearProps: 'all',
        },
      )
    }, el)

    return () => ctx.revert()
  }, [stagger, delay])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
