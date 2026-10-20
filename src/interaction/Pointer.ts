export type SwipeHandlers = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

export function bindSwipe(target: HTMLElement, handlers: SwipeHandlers): () => void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const onStart = (event: PointerEvent) => {
    if (event.button != null && event.button !== 0) return;
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
  };

  const onEnd = (event: PointerEvent) => {
    if (!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) handlers.onSwipeLeft?.();
    else handlers.onSwipeRight?.();
  };

  const onCancel = () => {
    tracking = false;
  };

  target.addEventListener('pointerdown', onStart);
  target.addEventListener('pointerup', onEnd);
  target.addEventListener('pointercancel', onCancel);

  return () => {
    target.removeEventListener('pointerdown', onStart);
    target.removeEventListener('pointerup', onEnd);
    target.removeEventListener('pointercancel', onCancel);
  };
}
