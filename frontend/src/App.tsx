import { Navigate, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./state/AppState";
import { Layout } from "./components/Layout";
import Landing from "./pages/Landing";
import Overview from "./pages/Overview";
import Discharge from "./pages/Discharge";
import CareTeam from "./pages/CareTeam";
import Schedule from "./pages/Schedule";
import Gaps from "./pages/Gaps";
import Simulator from "./pages/Simulator";
import Report from "./pages/Report";
import SignIn from "./pages/SignIn";
import Patients from "./pages/Patients";

export default function App() {
  return (
    <AppStateProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="patients" element={<Patients />} />
          <Route path="overview" element={<Overview />} />
          <Route path="discharge" element={<Discharge />} />
          <Route path="team" element={<CareTeam />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="gaps" element={<Gaps />} />
          <Route path="simulator" element={<Simulator />} />
          <Route path="report" element={<Report />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppStateProvider>
  );
}
