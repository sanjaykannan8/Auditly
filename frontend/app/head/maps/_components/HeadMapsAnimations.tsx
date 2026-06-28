'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'

/**
 * Client wrapper that runs GSAP entrance animations on the head maps list.
 * Children are server-rendered; this component only orchestrates animation.
 */
export default function HeadMapsAnimations({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', clearProps: 'all' } })

      const header = el.querySelector('[data-anim="header"]')
      const stats = el.querySelector('[data-anim="stats"]')
      const progress = el.querySelector('[data-anim="progress"]')
      const tabs = el.querySelector('[data-anim="tabs"]')
      const list = el.querySelector('[data-anim="list"]')

      if (header) tl.fromTo(header, { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.4 }, 0)

      // Stat cards stagger from left
      if (stats) {
        tl.fromTo(
          Array.from(stats.children),
          { opacity: 0, x: -18, scale: 0.96 },
          { opacity: 1, x: 0, scale: 1, duration: 0.38, stagger: 0.07 },
          0.1,
        )
      }

      if (progress) tl.fromTo(progress, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35 }, 0.3)

      // Animate progress bar fill after it appears
      const bar = el.querySelector('[data-progress-bar]') as HTMLElement | null
      if (bar) {
        const target = bar.style.width
        bar.style.width = '0%'
        tl.to(bar, { width: target, duration: 0.9, ease: 'power2.out' }, 0.55)
      }

      if (tabs) tl.fromTo(tabs, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3 }, 0.35)

      // Map cards stagger up
      if (list) {
        const cards = list.querySelectorAll('[data-map-card]')
        if (cards.length) {
          tl.fromTo(
            Array.from(cards),
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.38, stagger: 0.055 },
            0.42,
          )
        } else {
          // empty state fade
          tl.fromTo(list, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.4 }, 0.42)
        }
      }
    }, el)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}
