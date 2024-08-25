# Our Recipes

## About Our Recipes

Our Recipes is a modern, user-friendly web application designed to bring the joy of cooking right to your fingertips. It offers a range of features to enhance your culinary experience:

- Effortless recipe search
- AI-powered meal suggestions
- Easy-to-follow recipe displays
- Ingredient checklists
- Seamless editing and updating of recipes

## Demo

Here are some screenshots of our application:

![Home Page](2.png)

![Recipe Search](5.png)

![Meal Suggestion](1.png)

![Recipe Details](4.png)

![Recipe List](3.png)

## Key Features

1. **Intuitive User Interface**: Clean, responsive design ensures a smooth experience across all devices.
2. Recipe Search and Display
3. AI-powered Meal Suggestions
4. Recipe Editing and Creation
5. Telegram-based Authentication
6. Image Generation for Recipes
7. **AI Integration**: Leveraging cutting-edge AI technology for meal suggestions and recipe image generation.
8. **Powerful Editing Tools**: Authorized users can keep our recipe collection fresh and accurate.
9. **Secure Authentication**: Telegram-based authentication ensures a safe and personalized experience.
10. **Modern Tech Stack**: Built with Next.js, React, and Flask, representing the pinnacle of web development practices.
11. **Open Source**: We welcome contributions from developers around the world.

## Tech Stack

- Frontend: Next.js, React, Tailwind CSS
- Backend: Flask (Python)
- Authentication: Telegram API
- AI Services: OpenAI API
- Deployment: Vercel (Frontend), Custom Server (Backend)

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- Python (v3.8 or later)
- Docker (optional, for containerized setup)

### Local Development Setup

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/our-recipes.git
   cd our-recipes
   ```

2. Set up the backend:

   ```
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows use `.venv\Scripts\activate`
   pip install -r requirements.txt
   ```

3. Set up environment variables:

   - Create a `.env` file in the `backend` directory
   - Add necessary environment variables (refer to `.env.example` if available)

4. Run the Flask backend:

   ```
   flask run --debug
   ```

5. Set up the frontend:

   ```
   cd ../frontend/ourRecipesFront
   npm install
   ```

6. Set up frontend environment variables:

   - Create a `.env.local` file in the `frontend/ourRecipesFront` directory
   - Add necessary environment variables

7. Run the Next.js frontend:

   ```
   npm run dev
   ```

8. Access the application at `http://localhost:3000`

### Docker Setup

For a containerized setup, use Docker Compose:

```
docker-compose up --build
```

This will start both the frontend and backend services.

## Deployment

The application is currently deployed at:
[Our Recipes Web App](https://our-recipes-web-nextjs-git-main-nehoraihadads-projects.vercel.app/)

For detailed deployment instructions, please refer to the deployment documentation.

## Frontend Architecture

The frontend is built using Next.js, a React-based framework, providing server-side rendering and optimized performance. Key components include:

1. Home Page (`typescript:frontend/ourRecipesFront/src/app/(home)/page.tsx`)
2. Recipe Display (`typescript:frontend/ourRecipesFront/src/components/RecipeDisplay.tsx`)
3. Meal Suggestion Form (`typescript:frontend/ourRecipesFront/src/components/MealSuggestionForm.tsx`)
4. Authentication Components (`typescript:frontend/ourRecipesFront/src/app/(auth)/login/page.tsx`)

The frontend uses Tailwind CSS for styling, providing a clean and responsive design.

## Backend Architecture

The backend is powered by Flask, a Python web framework, handling API requests, authentication, and integration with external services. Key features include:

1. Recipe Search API (`python:backend/ourRecipesBack/__init__.py`, lines 160-168)
2. Telegram Authentication (`python:backend/ourRecipesBack/__init__.py`, lines 170-187)
3. AI Integration for Meal Suggestions and Image Generation (`python:backend/ourRecipesBack/__init__.py`, lines 295-340)

The backend uses Telethon for Telegram integration and OpenAI for AI-powered features.
