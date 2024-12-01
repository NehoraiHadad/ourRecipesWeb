interface IngredientListProps {
  ingredients: (string | JSX.Element)[];
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
          <span dangerouslySetInnerHTML={{ 
            __html: `${selectedIngredients[index] ? "✓ " : "• "} ${ingredient}` 
          }} />
        </li>
      ))}
    </ul>
  );
};

export default IngredientList;
