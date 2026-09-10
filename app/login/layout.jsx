import LoginCompatibilityBridge from "../components/LoginCompatibilityBridge";

export default function LoginLayout({ children }) {
  return (
    <>
      <LoginCompatibilityBridge />
      {children}
    </>
  );
}
