import Logo from "./Logo";

const NavBar = () => {
  return (
    <header>
      <nav className="w-full px-3 py-3 text-center  flex items-center justify-between ">
        <div className="w-7 h-7 bg-brown rounded-full flex items-center justify-center">
          🐭
        </div>
        <Logo />
        <div className="w-7 h-7 bg-brown rounded-full flex items-center justify-center">
          🦊
        </div>
      </nav>
    </header>
  );
};

export default NavBar;
