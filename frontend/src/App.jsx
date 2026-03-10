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
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${isActive
                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
        >
            {children}
        </Link>
    );
}

function Navigation() {
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-x-0 border-t-0 rounded-none">
            <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                            <span className="text-xl">🚨</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">MedAlert AI</h1>
                            <p className="text-xs text-slate-400">Crisis Communication Platform</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <NavLink to="/">Control Panel</NavLink>
                        <NavLink to="/dashboard">Analyst Dashboard</NavLink>
                        <NavLink to="/user">User View</NavLink>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="status-dot online"></div>
                        <span className="text-sm text-slate-300">System Online</span>
                    </div>
                </div>
            </div>
        </nav>
    );
}

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <div className="min-h-screen">
                <Navigation />
                <main className="pt-20 px-4 pb-8">
                    <Routes>
                        <Route path="/" element={<MasterControlPanel />} />
                        <Route path="/dashboard" element={<AnalystDashboard />} />
                        <Route path="/user" element={<UserMobileView />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

export default App;
