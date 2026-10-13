import { AuthProvider } from "./context/AuthContext.jsx";
import AppRoutes from "./routes/AppRoutes.jsx";
import SiteHeader from "./components/SiteHeader.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import { useSiteBranding } from "./hooks/useSiteBranding.js";
import "./App.css";
import "./components.css";

function App() {
  useSiteBranding();

  return (
    <AuthProvider>
      <SiteHeader />
      <main className="site-main">
        <AppRoutes />
      </main>
      <SiteFooter />
    </AuthProvider>
  );
}

export default App;
