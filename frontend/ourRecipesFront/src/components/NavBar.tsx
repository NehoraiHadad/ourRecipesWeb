"use client";
import { useState } from "react";
import Logo from "./Logo";
import { useRef } from "react";
import useOutsideClick from "../hooks/useOutsideClick";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../context/AuthContext";

const NavBar = () => {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useOutsideClick(menuRef, () => setIsMenuOpen(false));
  const { setAuthState, authState } = useAuthContext();

  const toggleMenu = () => {
    setIsMenuOpen((prevState) => !prevState);
  };

  const handleCloseMenu = () => {
    setIsMenuOpen(false);
  };

  const handleUserInterface = () => {
    console.log("Opening user preferences");
    setIsMenuOpen(false);
  };

  const handleLogout = async () => {
    console.log("User logged out");
    // Implement your logout logic
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error("Login failed");
      }

      setAuthState({
        isAuthenticated: false,
        canEdit: false,
        isChecking: true,
      });

      setIsMenuOpen(false);

      router.push("/login");
    } catch (error: unknown) {
      console.error("Error posting data:", error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sync`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Sync failed');
      
      const data = await response.json();
      console.log('Sync results:', data);
      //Add a notification here for the user about the sync results
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <header>
      <nav className="w-full px-3 py-3 text-center flex items-center justify-between">
        <div onClick={toggleMenu} className="cursor-pointer">
          <div className="w-7 h-7 bg-brown text-[#f8f2ea] rounded-full flex items-center justify-center hover:text-white">
            {isMenuOpen ? (
              <div onClick={handleCloseMenu} className="cursor-pointer">
                ✖
              </div>
            ) : (
              "☰"
            )}
          </div>
        </div>
        {isMenuOpen && (
          <div ref={menuRef} className="absolute top-9 mt-1 z-50">
            <ul className="bg-white rounded-md shadow-lg">
              {authState.canEdit && (
                <li className="text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                  <button
                    className="w-full h-full px-4 py-2 flex items-center justify-center gap-2"
                    onClick={handleSync}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                        מסנכרן...
                      </>
                    ) : (
                      'סנכרן מתכונים'
                    )}
                  </button>
                </li>
              )}
              <li className="text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                <button
                  className="w-full h-full px-4 py-2"
                  disabled
                  onClick={handleUserInterface}
                >
                  העדפות משתמש
                </button>
              </li>
              <li className="text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                <button
                  className="w-full h-full px-4 py-2"
                  onClick={handleLogout}
                >
                  התנתק
                </button>
              </li>
            </ul>
          </div>
        )}
        <Logo />
        <a
          href="https://github.com/NehoraiHadad/ourRecipesWeb"
          target="_blank"
          rel="noopener noreferrer"
          className="w-7 h-7 bg-brown rounded-full flex items-center justify-center"
          aria-label="Link to GitHub Page"
        >
          <svg
            viewBox="-2.4 -2.4 28.80 28.80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            transform="matrix(1, 0, 0, 1, 0, 0)rotate(0)"
            className="stroke-[#f8f2ea] w-5 h-5 hover:stroke-white"
          >
            <path
              d="M16 22.0268V19.1568C16.0375 18.68 15.9731 18.2006 15.811 17.7506C15.6489 17.3006 15.3929 16.8902 15.06 16.5468C18.2 16.1968 21.5 15.0068 21.5 9.54679C21.4997 8.15062 20.9627 6.80799 20 5.79679C20.4558 4.5753 20.4236 3.22514 19.91 2.02679C19.91 2.02679 18.73 1.67679 16 3.50679C13.708 2.88561 11.292 2.88561 8.99999 3.50679C6.26999 1.67679 5.08999 2.02679 5.08999 2.02679C4.57636 3.22514 4.54413 4.5753 4.99999 5.79679C4.03011 6.81549 3.49251 8.17026 3.49999 9.57679C3.49999 14.9968 6.79998 16.1868 9.93998 16.5768C9.61098 16.9168 9.35725 17.3222 9.19529 17.7667C9.03334 18.2112 8.96679 18.6849 8.99999 19.1568V22.0268"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            ></path>{" "}
            <path
              d="M9 20.0267C6 20.9999 3.5 20.0267 2 17.0267"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            ></path>{" "}
          </svg>
        </a>
      </nav>
    </header>
  );
};

export default NavBar;
