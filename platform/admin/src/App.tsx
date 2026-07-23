import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Clients } from "./pages/Clients";
import { ClientDetail } from "./pages/ClientDetail";

export default function App() {
  const { session, estAdmin, chargement } = useAuth();

  if (chargement) {
    return <div className="p-8 text-ardoise">Chargement…</div>;
  }

  if (!session || !estAdmin) {
    // Non connecté, ou connecté mais pas administrateur.
    return <Login connecteNonAdmin={!!session && !estAdmin} />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
