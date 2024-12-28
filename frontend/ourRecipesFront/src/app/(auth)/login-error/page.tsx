export default function LoginErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-6 rounded-xl shadow-warm">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-secondary-900">שגיאה בהתחברות</h2>
          <p className="mt-2 text-secondary-600">
            אירעה שגיאה במהלך ההתחברות. אנא נסה שוב או צור קשר עם התמיכה.
          </p>
        </div>
        <div className="space-y-4">
          <Link 
            href="/login"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            חזור לדף ההתחברות
          </Link>
        </div>
      </div>
    </div>
  );
} 