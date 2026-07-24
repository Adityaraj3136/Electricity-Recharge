import { useRef, useState, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  /** Minimum pull distance in px before triggering refresh */
  threshold?: number;
  /** Whether pull-to-refresh is currently enabled */
  enabled?: boolean;
}

interface UsePullToRefreshReturn {
  isPulling: boolean;
  isRefreshing: boolean;
  pullProgress: number; // 0–1 progress toward threshold
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const startYRef = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isPulling = pullDistance > 0;
  const pullProgress = Math.min(pullDistance / threshold, 1);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || isRefreshing) return;
    // Only trigger pull-to-refresh if the user is at the very top of the page
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    if (scrollY > 5) return;
    startYRef.current = e.touches[0].clientY;
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || isRefreshing || startYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startYRef.current;
    if (delta < 0) {
      // Scrolling up, ignore
      setPullDistance(0);
      return;
    }
    // Apply resistance: movement feels heavier as you pull further
    const dampened = Math.sqrt(delta) * 6;
    setPullDistance(Math.min(dampened, threshold * 1.5));
  }, [enabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!enabled || startYRef.current === null) return;
    startYRef.current = null;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold); // keep spinner visible while refreshing
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [enabled, pullDistance, threshold, onRefresh]);

  return {
    isPulling,
    isRefreshing,
    pullProgress,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
