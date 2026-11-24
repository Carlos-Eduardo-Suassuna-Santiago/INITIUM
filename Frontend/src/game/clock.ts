export function startPreciseClock(onTick: (timestamp: number) => void): () => void {
  let timeoutId = 0;

  const tick = () => {
    const timestamp = Date.now();
    onTick(timestamp);
    const delay = Math.max(16, 1000 - (timestamp % 1000));
    timeoutId = window.setTimeout(tick, delay);
  };

  const onVisibilityChange = () => onTick(Date.now());
  document.addEventListener("visibilitychange", onVisibilityChange);
  tick();

  return () => {
    window.clearTimeout(timeoutId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

export function getRemainingSeconds(startTime: number | undefined, durationSeconds: number, timestamp = Date.now()) {
  if (!startTime) return durationSeconds;
  return Math.max(0, durationSeconds - (timestamp - startTime) / 1000);
}
