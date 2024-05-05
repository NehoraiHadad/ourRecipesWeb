import Image from 'next/image';
import { recipe } from '../types';

import Image1 from "../../public/categories_photos/1.png"
import Image2 from "../../public/categories_photos/2.png"
import Image3 from "../../public/categories_photos/3.png"
import Image4 from "../../public/categories_photos/4.png"
import Image5 from "../../public/categories_photos/5.png"
import Image6 from "../../public/categories_photos/6.png"

export default function RecipeLine({ recipe }: {recipe: recipe }) {
  return (
    <div className="flex flex-row justify-between items-center px-2 py-2 border-b ">
      <div className="min-w-10 h-10 relative ">
        <Image
          src={[Image1,Image2, Image3, Image4, Image5, Image6][Math.floor(Math.random() * [Image1,Image2, Image3, Image4, Image5, Image6].length)]}
          alt={recipe.title}
          className="h-full w-full"
          width={200}
          height={200}
        />
      </div>
      <div className="flex-grow mx-4">
        <h3 className="font-bold text-base">{recipe.title}</h3>
        {/* <h3 className="text-xs">{recipe.time} דקות הכנה</h3> */}
      </div>
    </div>
  );
}