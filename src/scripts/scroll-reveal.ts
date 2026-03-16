/**
 * Shared scroll-reveal animation for .gs elements.
 * Import and call initScrollReveal() on any page that uses the .gs class.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function initScrollReveal(selector = '.gs', options?: { duration?: number; start?: string }) {
  const duration = options?.duration ?? 0.7;
  const start = options?.start ?? 'top 85%';

  gsap.utils.toArray<HTMLElement>(selector).forEach(el => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start },
    });
  });
}
