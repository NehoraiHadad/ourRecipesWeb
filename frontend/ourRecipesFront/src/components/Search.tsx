import { useState, useEffect } from "react";

interface SearchProps {
  onSearch: (query: string) => void;
  resultCount?: number | "";
}

const Search = ({ onSearch, resultCount = 0 }: SearchProps) => {
  const [query, setQuery] = useState("");
  const [showResultCount, setShowResultCount] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [startAnimation, setStartAnimation] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query !== "") {
      setIsSearching(true);
      setShowResultCount(true);
      onSearch(query);
    }
  };

  useEffect(() => {
    if (resultCount === "") {
    } else if (typeof resultCount === "number") {
      setIsSearching(false);
    }
  }, [resultCount]);

  useEffect(() => {
    if (isSearching) {
      // Set a delay before starting the animation
      const timer = setTimeout(() => {
        setStartAnimation(true);
      }, 1);

      // Cleanup function to clear the timeout if the component unmounts
      // or if `isSearching` changes before the timer completes
      return () => clearTimeout(timer);
    }
  }, [isSearching]);

  return (
    <div className="flex items-center justify-around w-full px-2 py-2">
      {(showResultCount || isSearching) && (
        <div
          className={`flex items-center justify-center h-7 ${
            startAnimation ? "w-7" : "w-0"
          } bg-brown text-white rounded-full transition-all duration-700 ease-in-out font-bold	 ${
            startAnimation && isSearching ? "animate-bounce" : ""
          }`}
        >
          {!isSearching && resultCount}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className={`flex justify-between p-0.5 bg-white shadow rounded-lg ${
          startAnimation ? "mr-2" : ""
        }`}
        style={{
          transition: "width 0.7s ease",
          width: showResultCount ? "calc(100% - 2.5rem)" : "100%",
        }}
      >
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          className="outline-none py-0.5 px-2 rounded-lg w-full"
        />
        <button
          type="submit"
          className="px-2 py-0.5 text-white rounded-lg hover:bg-slate-100 transition-colors"
        >
          🔎
        </button>
      </form>
    </div>
  );
};

export default Search;
