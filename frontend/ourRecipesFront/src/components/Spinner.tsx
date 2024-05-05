const Spinner: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="text-gray-700 mt-3">{message}</p>
        </div>
    );
};

export default Spinner;