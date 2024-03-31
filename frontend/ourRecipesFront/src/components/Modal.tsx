import { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.id === "modal-backdrop") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEsc);
    window.addEventListener("click", handleOutsideClick);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("click", handleOutsideClick);
    };
  }, [onClose]);

  return (
    <div
      id="modal-backdrop"
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 transition-all duration-700 ease-in-out"
    >
      <div className="bg-white p-4 rounded-lg shadow-lg w-3xl max-h-[90vh] overflow-auto">
        <div className="bg-white flex items-top  justify-start w-full h-7">
          <button
            onClick={onClose}
            className="text-lg absolute bg-white rounded-full w-7 h-7 transition-all duration-500 ease-in-out hover:text-brown"
          >
            ✖
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
