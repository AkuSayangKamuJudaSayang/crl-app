import LoginCompatibilityBridge from "../components/LoginCompatibilityBridge";

export const metadata={applicationName:"CRL-App Teacher",manifest:"/teacher-manifest.webmanifest",appleWebApp:{capable:true,title:"CRL-App Teacher",statusBarStyle:"default"},icons:{apple:[{url:"/icons/teacher-180.png",sizes:"180x180",type:"image/png"}]}};

export default function LoginLayout({ children }) {
  return (
    <>
      <LoginCompatibilityBridge />
      {children}
    </>
  );
}
