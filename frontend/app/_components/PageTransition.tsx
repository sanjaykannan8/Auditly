'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'

/**
 * Wraps any page content and fades + slides it in on mount.
 * Drop this around the outermost <div> in any page component.
 */
export default function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all' },
      )
    }, el)

    return () => ctx.revert()
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
