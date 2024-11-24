import { useState, useEffect } from "react";
import { recipe } from "../types";

interface SearchProps {
  onSearch: (recipes: Record<string, recipe>) => void;
  resultCount?: number | "";
}

const Search = ({ onSearch, resultCount }: SearchProps) => {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [startAnimation, setStartAnimation] = useState(false);

  useEffect(() => {
    if (isSearching) {
      const timer = setTimeout(() => {
        setStartAnimation(true);
      }, 1);
      return () => clearTimeout(timer);
    } else {
      setStartAnimation(false);
    }
  }, [isSearching]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query === "") return;

    setIsSearching(true);

    try {
      // Search local DB
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/search?query=${encodeURIComponent(query)}`,
        { credentials: "include" }
      );
      
      if (!response.ok) throw new Error("Search failed");
      
      const data = await response.json();
      console.log("Local search results:", data.results);
      onSearch(data.results);
      
      // Search in Telegram
      const telegramResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/search/telegram?query=${encodeURIComponent(query)}&existing_ids[]=${Object.keys(data.results).join("&existing_ids[]=")}`,
        { credentials: "include" }
      );
      
      if (!telegramResponse.ok) throw new Error("Telegram search failed");
      
      const telegramData = await telegramResponse.json();
      console.log("Telegram search results:", telegramData.results);
      const allResults = {...data.results, ...telegramData.results};
      onSearch(allResults);
      
    } catch (error) {
      console.error("Search error:", error);
      onSearch({});
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  return (
    <div className="flex items-center justify-around w-full px-2 py-2">
      {(resultCount !== "" || isSearching) && (
        <div className={`flex items-center justify-center h-7 ${
          startAnimation ? "w-7" : "w-0"
        } bg-brown text-white rounded-full transition-all duration-700 ease-in-out font-bold ${
          startAnimation && isSearching ? "animate-bounce" : ""
        }`}>
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
          width: resultCount !== "" || isSearching ? "calc(100% - 2.5rem)" : "100%",
        }}
      >
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          className="outline-none py-0.5 px-2 rounded-lg w-full"
          required
        />
        <button
          type="submit"
          className="px-2 py-0.5 text-white rounded-lg hover:bg-slate-100 transition-colors"
          disabled={isSearching}
        >
          🔎
        </button>
      </form>
    </div>
  );
};

export default Search;
