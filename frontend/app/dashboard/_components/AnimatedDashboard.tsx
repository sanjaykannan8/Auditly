'use client'

import { useEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import AnimatedCounter from '@/app/_components/AnimatedCounter'

/**
 * Wraps the overview strip and animates each stat cell sliding in from the left.
 */
export function AnimatedOverviewStrip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cells = el.querySelectorAll('[data-stat-cell]')
    if (!cells.length) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cells,
        { opacity: 0, x: -20 },
        {
          opacity: 1,
          x: 0,
          duration: 0.45,
          ease: 'power2.out',
          stagger: 0.08,
          delay: 0.15,
          clearProps: 'all',
        },
      )
    }, el)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}

/**
 * Animated stat number — counts up from 0.
 */
export function StatNumber({ value, className }: { value: number; className?: string }) {
  return <AnimatedCounter value={value} className={className} />
}

/**
 * Stagger-animates the department heatmap cards.
 */
export function AnimatedHeatmap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cards = el.querySelectorAll('[data-dept-card]')
    if (!cards.length) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 28, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.4,
          ease: 'power2.out',
          stagger: 0.06,
          delay: 0.2,
          clearProps: 'all',
        },
      )
    }, el)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}

/**
 * Animated priority action rows — stagger slide in from right.
 */
export function AnimatedPriorityRows({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rows = el.querySelectorAll('[data-action-row]')
    if (!rows.length) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        rows,
        { opacity: 0, x: 16 },
        {
          opacity: 1,
          x: 0,
          duration: 0.35,
          ease: 'power2.out',
          stagger: 0.055,
          delay: 0.3,
          clearProps: 'all',
        },
      )
    }, el)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}

/**
 * Compliance score ring animated via GSAP (replaces CSS transition).
 */
export function AnimatedScoreRing({ value }: { value: number }) {
  const circleRef = useRef<SVGCircleElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  const radius = 52
  const circumference = 2 * Math.PI * radius
  const targetOffset = circumference * (1 - Math.min(100, Math.max(0, value)) / 100)
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#ff5d03' : '#ef4444'

  useEffect(() => {
    const circle = circleRef.current
    const text = textRef.current
    if (!circle || !text) return

    const ctx = gsap.context(() => {
      // Start fully empty
      gsap.set(circle, { strokeDashoffset: circumference })

      // Animate stroke fill
      gsap.to(circle, {
        strokeDashoffset: targetOffset,
        duration: 1.4,
        ease: 'power2.out',
        delay: 0.4,
      })

      // Count up the number
      const obj = { val: 0 }
      gsap.to(obj, {
        val: value,
        duration: 1.4,
        ease: 'power2.out',
        delay: 0.4,
        onUpdate() {
          text.textContent = `${Math.round(obj.val)}%`
        },
      })
    })

    return () => ctx.revert()
  }, [value, circumference, targetOffset])

  return (
    <div className="relative w-32 h-32">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle
          ref={circleRef}
          cx="64" cy="64" r={radius} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span ref={textRef} className="text-3xl font-bold text-gray-900 tracking-tight">0%</span>
      </div>
    </div>
  )
}

/**
 * Animates the greeting header section on mount.
 */
export function AnimatedGreeting({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: -12 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'all' },
      )
    }, el)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}

/**
 * Animates the two main middle cards (Today's Brief + Compliance Score) fading up.
 */
export function AnimatedCards({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cards = el.querySelectorAll('[data-main-card]')
    if (!cards.length) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
          stagger: 0.1,
          delay: 0.25,
          clearProps: 'all',
        },
      )
    }, el)

    return () => ctx.revert()
  }, [])

  return <div ref={ref}>{children}</div>
}
