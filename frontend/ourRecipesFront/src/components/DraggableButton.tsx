import React, { useRef, useState, useCallback } from "react";

interface DraggableBubbleProps {
  onClick: () => void;
}

const DraggableBubble: React.FC<DraggableBubbleProps> = ({ onClick }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState(false);

  const startDrag = useCallback(() => {
    setDragged(false);
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", endDrag);
    document.addEventListener("touchmove", onDrag);
    document.addEventListener("touchend", endDrag);
  }, []);

  const onDrag = useCallback((event: MouseEvent | TouchEvent) => {
    setDragged(true);
    event.preventDefault();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    if (ref.current) {
      ref.current.style.left = `${clientX - 20}px`;
      ref.current.style.top = `${clientY - 20}px`;
    }
  }, []);

  const endDrag = useCallback(() => {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", endDrag);
    document.removeEventListener("touchmove", onDrag);
    document.removeEventListener("touchend", endDrag);
  }, []);

  return (
    <div
      ref={ref}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
      onClick={() => { if (!dragged) onClick(); }}
      style={{
        position: "fixed",
        left: `10px`,
        top: `230px`,
        touchAction: "none",
        cursor: "grab",
        zIndex: 45,
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        backgroundColor: "rgb(58, 63, 76)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: "20px",
        userSelect: "none",
      }}
    >
      ✨
    </div>
  );
};

export default DraggableBubble;
