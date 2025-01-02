interface IngredientListProps {
  ingredients: (string | JSX.Element)[];
  selectedIngredients: boolean[];
  onIngredientClick: (index: number) => void;
  multiplier?: number;
}

const IngredientList: React.FC<IngredientListProps> = ({
  ingredients,
  selectedIngredients,
  onIngredientClick,
  multiplier = 1
}) => {
  const highlightQuantity = (ingredient: string | JSX.Element) => {
    if (typeof ingredient === 'string' && multiplier !== 1) {
      const match = ingredient.match(/^([\d./]+|\d*\s*[½¼¾]|\d*\s*(חצי|רבע|שלושת רבעי|שליש|שני שליש|רבעי|שמינית))\s*/);
      if (match) {
        const [fullMatch, quantity] = match;
        const rest = ingredient.slice(fullMatch.length);
        return (
          <>
            <span className="text-primary-600 font-medium">{quantity}</span>
            {" "}
            {rest}
          </>
        );
      }
    }
    return ingredient;
  };

  return (
    <ul className="p-0">
      {ingredients.map((ingredient, index) => (
        <li
          key={index}
          onClick={() => onIngredientClick(index)}
          className="cursor-pointer hover:bg-gray-50 py-0.5 px-1 rounded-md transition-colors duration-150"
        >
          <span className="flex items-baseline gap-1.5">
            <span className="text-gray-400 select-none">
              {selectedIngredients[index] ? "✓" : "•"}
            </span>
            <span className={selectedIngredients[index] ? "line-through text-gray-400" : ""}>
              {highlightQuantity(ingredient)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
};

export default IngredientList;
