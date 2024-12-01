"use client";

import GuestLogin from "../../../components/GuestLogin";
import TelegramLoginWidget from "../../../components/TelegramLoginWidget";

const Page = () => {

  return (
    <>
      <TelegramLoginWidget />
      <h2 className="text-center text-xl font-semibold my-2">או</h2>
      <GuestLogin />
    </>
  );
};

export default Page;
