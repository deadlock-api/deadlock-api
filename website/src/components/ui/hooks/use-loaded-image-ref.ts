/**
 * A ref for an `<img>` that calls `onLoaded` when the image has already finished by the time it is attached, then
 * forwards to `ref`. An SSR'd or cached image can finish loading before React attaches `onLoad`, so that event never
 * fires for it.
 */
export function useLoadedImageRef(
  ref: React.Ref<HTMLImageElement> | undefined,
  onLoaded: (img: HTMLImageElement) => void,
) {
  return (img: HTMLImageElement | null) => {
    if (img?.complete) onLoaded(img);
    if (typeof ref === "function") return ref(img);
    if (ref) ref.current = img;
  };
}
