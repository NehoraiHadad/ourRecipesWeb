interface IngredientListProps {
  ingredients: string[];
  selectedIngredients: boolean[];
  onIngredientClick: (index: number) => void;
}

const IngredientList: React.FC<IngredientListProps> = ({
  ingredients,
  selectedIngredients,
  onIngredientClick,
}) => {
  return (
    <ul>
      {ingredients.map((ingredient, index) => (
        <li
          key={index}
          className="cursor-pointer"
          onClick={() => onIngredientClick(index)}
        >
          <span>
            {selectedIngredients[index] ? "✓ " : "• "} {ingredient}
          </span>
        </li>
      ))}
    </ul>
  );
};

export default IngredientList;
