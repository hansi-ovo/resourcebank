import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Hero } from './Hero';
import { startHeroTransition } from './HeroTransition';
import { useReducedMotion } from '@/lib/motion';

/**
 * Hero page: owns the transition into /resources. The route swap happens
 * underneath the fixed clone overlay (03-pages §Transition step 2).
 */
export function HeroPage() {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const busy = useRef(false);

  const onStarted = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    startHeroTransition({
      reduced,
      swapRoute: () => navigate('/resources'),
      onDone: () => {
        busy.current = false;
      },
    });
  }, [navigate, reduced]);

  return <Hero onStarted={onStarted} />;
}
