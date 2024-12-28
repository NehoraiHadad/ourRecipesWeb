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
        width: "48px",
        height: "48px",
        borderRadius: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgb(250, 151, 135)",
        fontSize: "20px",
        userSelect: "none",
        boxShadow: "0 2px 6px rgba(170, 121, 72, 0.08)",
        border: "1px solid rgba(251, 180, 167, 0.3)",
        transition: "transform 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease, border-color 0.3s ease",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.05)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(170, 121, 72, 0.12)";
        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 1)";
        e.currentTarget.style.border = "1px solid rgba(251, 180, 167, 0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 2px 6px rgba(170, 121, 72, 0.08)";
        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
        e.currentTarget.style.border = "1px solid rgba(251, 180, 167, 0.3)";
      }}
    >
      <div className="relative">
        <span role="img" aria-label="recipe suggestion" style={{ fontSize: '18px' }}>✨</span>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "140%",
            height: "140%",
            background: "radial-gradient(circle, rgba(251,180,167,0.08) 0%, rgba(251,180,167,0) 70%)",
            borderRadius: "50%",
            zIndex: -1,
          }}
        />
      </div>
    </div>
  );
};

export default DraggableBubble;
