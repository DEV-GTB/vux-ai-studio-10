import { useEffect, useRef } from 'react'

/**
 * Lightweight, dependency-free canvas particle field.
 * - Pauses when the tab is hidden and honors prefers-reduced-motion.
 * - Scales particle count to the surface area so it stays cheap on mobile.
 */
export function ParticleField({
  className = '',
  density = 0.00012,
  primary = '76, 215, 246',
  secondary = '155, 89, 182',
  linkDistance = 130,
  interactive = true,
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let width = 0
    let height = 0
    let particles = []
    let animationId = null
    let running = true
    let pointer = { x: -9999, y: -9999 }

    const seed = () => {
      const count = Math.max(18, Math.min(120, Math.round(width * height * density)))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.5 + 0.6,
        a: Math.random() * 0.45 + 0.2,
        tint: Math.random() > 0.72 ? secondary : primary,
      }))
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy

        if (p.x < -20) p.x = width + 20
        if (p.x > width + 20) p.x = -20
        if (p.y < -20) p.y = height + 20
        if (p.y > height + 20) p.y = -20

        if (interactive) {
          const dx = p.x - pointer.x
          const dy = p.y - pointer.y
          const dist = Math.hypot(dx, dy)
          if (dist < 120 && dist > 0) {
            p.x += (dx / dist) * 0.6
            p.y += (dy / dist) * 0.6
          }
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.tint}, ${p.a})`
        ctx.fill()

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j]
          const dist = Math.hypot(p.x - q.x, p.y - q.y)
          if (dist < linkDistance) {
            const alpha = (1 - dist / linkDistance) * 0.12
            ctx.beginPath()
            ctx.strokeStyle = `rgba(${primary}, ${alpha})`
            ctx.lineWidth = 0.6
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.stroke()
          }
        }
      }

      if (running) animationId = requestAnimationFrame(draw)
    }

    const onPointerMove = (event) => {
      const rect = canvas.getBoundingClientRect()
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const onPointerLeave = () => {
      pointer = { x: -9999, y: -9999 }
    }
    const onVisibility = () => {
      running = !document.hidden
      if (running) {
        animationId = requestAnimationFrame(draw)
      } else if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }

    resize()

    if (reduceMotion) {
      draw()
      running = false
    } else {
      animationId = requestAnimationFrame(draw)
      const observer = new ResizeObserver(resize)
      observer.observe(canvas)
      if (interactive) {
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerleave', onPointerLeave)
      }
      document.addEventListener('visibilitychange', onVisibility)

      return () => {
        running = false
        if (animationId) cancelAnimationFrame(animationId)
        observer.disconnect()
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerleave', onPointerLeave)
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [density, primary, secondary, linkDistance, interactive])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

export default ParticleField
