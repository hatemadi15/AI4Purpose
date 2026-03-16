import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import MasterControlPanel from './pages/MasterControlPanel';
import AnalystDashboard from './pages/AnalystDashboard';
import UserMobileView from './pages/UserMobileView';

function NavLink({ to, children }) {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <Link
            to={to}
            className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium leading-none transition-all ${
                isActive
                    ? 'border-cyan-300/40 bg-cyan-300/12 text-cyan-100 shadow-[0_0_0_1px_rgba(111,214,223,0.18)]'
                    : 'border-slate-800/80 bg-slate-950/50 text-slate-300 hover:border-slate-700 hover:text-slate-100'
            }`}
        >
            <span>{children}</span>
        </Link>
    );
}

function Navigation() {
    return (
        <nav className="fixed left-0 right-0 top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
            <div className="relative mx-auto flex items-center px-4 py-3 max-w-[1920px]">
                <div className="flex items-center gap-3.5 self-center">
                    <img
                        src="/tanbih-mark.svg"
                        alt="Tanbih mark"
                        className="h-10 w-10 self-center object-contain"
                    />
                    <div className="min-w-0 self-center">
                        <div className="text-[1.35rem] font-semibold uppercase leading-none tracking-[0.34em] text-slate-50">
                            Tanbih
                        </div>
                        <div className="mt-1 text-[0.68rem] uppercase leading-none tracking-[0.24em] text-slate-400">
                            Trusted alerts in times of crisis
                        </div>
                    </div>
                </div>

                <div className="mx-auto flex flex-wrap items-center gap-2 lg:absolute lg:left-1/2 lg:top-1/2 lg:mx-0 lg:-translate-x-1/2 lg:-translate-y-1/2">
                    <NavLink to="/">Control Panel</NavLink>
                    <NavLink to="/dashboard">Analyst Dashboard</NavLink>
                    <NavLink to="/user">User View</NavLink>
                </div>
            </div>
        </nav>
    );
}

function App() {
    function AppShell() {
        const location = useLocation();
        const isDashboard = location.pathname === '/dashboard';

        return (
            <div className="min-h-screen">
                <Navigation />
                <main className={`mx-auto px-4 pb-8 pt-28 ${isDashboard ? 'max-w-[1920px]' : 'max-w-[1600px]'}`}>
                    <Routes>
                        <Route path="/" element={<MasterControlPanel />} />
                        <Route path="/dashboard" element={<AnalystDashboard />} />
                        <Route path="/user" element={<UserMobileView />} />
                    </Routes>
                </main>
            </div>
        );
    }

    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppShell />
        </Router>
    );
}

export default App;
