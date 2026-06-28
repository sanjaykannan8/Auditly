'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'

/**
 * Client wrapper that orchestrates GSAP entrance animations for the map detail page.
 */
export default function MapDetailAnimations({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out', clearProps: 'all' } })

      const selectors = [
        '[data-anim="breadcrumb"]',
        '[data-anim="header"]',
        '[data-anim="steps"]',
        '[data-anim="feedback"]',
        '[data-anim="upload"]',
        '[data-anim="history"]',
      ]

      selectors.forEach((sel, i) => {
        const node = el.querySelector(sel)
        if (!node) return
        tl.fromTo(
          node,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.42 },
          i === 0 ? 0 : `<0.08`,
        )
      })

      // Animate step progress bar fill
      const bar = el.querySelector('[data-step-bar]') as HTMLElement | null
      if (bar) {
        const target = bar.style.width
        bar.style.width = '0%'
        tl.to(bar, { width: target, duration: 0.8, ease: 'power2.out' }, 0.5)
      }

      // Stagger step checkboxes
      const checkboxes = el.querySelectorAll('[data-step-item]')
      if (checkboxes.length) {
        tl.fromTo(
          Array.from(checkboxes),
          { opacity: 0, x: -12 },
          { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, clearProps: 'all' },
          0.35,
        )
      }

      // Stagger submission history cards
      const subCards = el.querySelectorAll('[data-sub-card]')
      if (subCards.length) {
        tl.fromTo(
          Array.from(subCards),
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.32, stagger: 0.07, clearProps: 'all' },
          0.6,
        )
      }
    }, el)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}
