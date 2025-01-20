import { useEffect, RefObject } from "react";

type RefType = RefObject<HTMLElement> | null;

function useOutsideClick(
  refs: RefType | RefType[],
  callback: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // Convert single ref to array for unified processing
      const refsArray = Array.isArray(refs) ? refs : [refs];
      
      // Check if click target is outside all refs
      const isOutside = refsArray.every((ref) => {
        if (!ref?.current) return true;
        return !ref.current.contains(event.target as Node);
      });

      if (isOutside) {
        callback();
      }
    };

    // Add both mouse and touch events for better mobile support
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("touchstart", handleClickOutside, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
    };
  }, [refs, callback, enabled]);
}

export default useOutsideClick;
