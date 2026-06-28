'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'

/** Animates the cityscape pillars on mount — rises from bottom with stagger */
export function PillarReveal({ selector }: { selector: string }) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      const pillars = document.querySelectorAll(selector)
      if (!pillars.length) return

      gsap.fromTo(
        pillars,
        { scaleY: 0, transformOrigin: 'bottom center' },
        {
          scaleY: 1,
          duration: 1.1,
          ease: 'power3.out',
          stagger: 0.06,
          delay: 0.1,
        },
      )
    })
    return () => ctx.revert()
  }, [selector])

  return null
}

/** Animates the sign-in card — fade + scale in */
export function CardReveal({ cardRef }: { cardRef: React.RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, scale: 0.96, y: 16 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.3 },
      )
    }, el)

    return () => ctx.revert()
  }, [cardRef])

  return null
}
