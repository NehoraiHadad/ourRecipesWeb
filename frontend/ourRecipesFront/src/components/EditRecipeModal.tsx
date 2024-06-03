import useOutsideClick from "@/hooks/useOutsideClick";
import {useRef} from "react";


interface EditRecipeModalProps {
  show: boolean;
  onClose: () => void;
  children: React.ReactNode;
}



const EditRecipeModal: React.FC<EditRecipeModalProps> = ({
  show,
  onClose,
  children,
}) => {
  
  const editModalRef = useRef(null);
  useOutsideClick(editModalRef, onClose);
  
  if (!show) return null;

  return (
    <div  className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 transition-all duration-700 ease-in-out">
      <div ref={editModalRef} className="bg-white p-4 rounded-lg shadow-lg w-3xl max-h-[90vh] overflow-auto">
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

export default EditRecipeModal;
