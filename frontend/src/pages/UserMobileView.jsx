import { useState, useEffect } from 'react';
import { getUsers, subscribeUser, getVapidPublicKey } from '../services/api';
import useSocket from '../hooks/useSocket';
import BrandLogo from '../components/BrandLogo';
import SystemIcon from '../components/SystemIcon';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function UserMobileView() {
    const { socket, isConnected, joinUser } = useSocket();
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subscriptionStatus, setSubscriptionStatus] = useState('unknown');
    const [subscribing, setSubscribing] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        if (selectedUser) {
            joinUser(selectedUser.id);
            checkSubscriptionStatus();
        }
    }, [selectedUser, joinUser]);

    useEffect(() => {
        if (!socket || !selectedUser) return undefined;

        const handleUserAlert = (data) => {
            if (data.userId && String(data.userId) !== String(selectedUser.id)) {
                return;
            }

            const notification = {
                id: Date.now(),
                title: data.alert?.event_type || 'Alert',
                body: data.message || `Alert for ${data.alert?.region || 'your area'}`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                severity: data.alert?.severity,
                zone: data.zone
            };
            setNotifications((prev) => [notification, ...prev]);
        };

        socket.on('user_alert', handleUserAlert);

        return () => {
            socket.off('user_alert', handleUserAlert);
        };
    }, [socket, selectedUser]);

    const loadUsers = async () => {
        try {
            const response = await getUsers();
            setUsers(response.data.users);
            if (response.data.users.length > 0) {
                setSelectedUser(response.data.users[0]);
            }
        } catch (err) {
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const checkSubscriptionStatus = () => {
        if (!selectedUser) return;

        if (selectedUser.push_subscription) {
            setSubscriptionStatus('enabled');
        } else {
            setSubscriptionStatus('disabled');
        }
    };

    const enableNotifications = async () => {
        if (!selectedUser) return;

        setSubscribing(true);
        setError(null);

        try {
            if (!('Notification' in window)) {
                throw new Error('Push notifications not supported in this browser');
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                throw new Error('Notification permission denied');
            }

            const registration = await navigator.serviceWorker.register('/service-worker.js');
            await navigator.serviceWorker.ready;

            const vapidResponse = await getVapidPublicKey();
            const vapidPublicKey = vapidResponse.data.publicKey;

            if (!vapidPublicKey) {
                throw new Error('VAPID public key not configured');
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });

            await subscribeUser(selectedUser.id, subscription.toJSON());

            setSubscriptionStatus('enabled');
            setSelectedUser((prev) => ({
                ...prev,
                push_subscription: subscription.toJSON()
            }));

            new Notification('Notifications Enabled', {
                body: 'You will now receive crisis alerts',
                icon: '/tanbih-mark.svg'
            });
        } catch (err) {
            console.error('Subscription error:', err);
            setError(err.message);
            setSubscriptionStatus('disabled');
        } finally {
            setSubscribing(false);
        }
    };

    if (loading) {
        return (
            <div className="panel flex h-96 items-center justify-center">
                <div className="text-sm text-slate-400">Loading user view</div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <section className="panel p-6 md:p-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div>
                        <BrandLogo size="lg" subtitle="" />
                        <div className="mt-6">
                            <h1 className="text-3xl font-semibold text-slate-50">User Mobile View</h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Receive push notifications for crisis alerts</p>
                        </div>
                    </div>

                    <div className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                        isConnected
                            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                            : 'border-red-400/25 bg-red-400/10 text-red-200'
                    }`}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </div>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
                <div className="panel p-6">
                    <div className="section-title">User</div>
                    <label className="mt-3 block text-sm text-slate-400">Select Demo User</label>
                    <select
                        value={selectedUser?.id || ''}
                        onChange={(e) => {
                            const user = users.find((item) => item.id === parseInt(e.target.value, 10));
                            setSelectedUser(user);
                        }}
                        className="surface-input mt-2"
                    >
                        {users.map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.name} ({user.preferred_language?.toUpperCase()})
                            </option>
                        ))}
                    </select>

                    {selectedUser && (
                        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                            <div className="flex items-start gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-lg font-semibold text-cyan-100">
                                    {selectedUser.name?.charAt(0)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-slate-100">{selectedUser.name}</div>
                                    <div className="mt-1 text-xs text-slate-400">{selectedUser.email}</div>
                                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                        <SystemIcon name="pin" className="h-3.5 w-3.5" />
                                        <span>
                                            {parseFloat(selectedUser.lat).toFixed(4)}, {parseFloat(selectedUser.lon).toFixed(4)}
                                        </span>
                                    </div>
                                </div>
                                <div className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                    {selectedUser.preferred_language?.toUpperCase()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="panel p-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="section-title">Push Notifications</div>
                            <h2 className="mt-2 text-xl font-semibold text-slate-50">Receive real-time crisis alerts</h2>
                        </div>
                        <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                            subscriptionStatus === 'enabled'
                                ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                : 'border-slate-700 bg-slate-950/60 text-slate-400'
                        }`}>
                            {subscriptionStatus === 'enabled' ? 'Enabled' : 'Disabled'}
                        </div>
                    </div>

                    {subscriptionStatus !== 'enabled' ? (
                        <button
                            type="button"
                            onClick={enableNotifications}
                            disabled={subscribing}
                            className="command-button mt-6 w-full"
                        >
                            <SystemIcon name="bell" className="h-4 w-4" />
                            <span>{subscribing ? 'Enabling...' : 'Enable Notifications'}</span>
                        </button>
                    ) : (
                        <div className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                            You will receive push notifications for alerts in your area
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    )}
                </div>
            </section>

            <section className="panel p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="section-title">Notification History</div>
                        <h2 className="mt-2 text-xl font-semibold text-slate-50">Notifications</h2>
                    </div>
                    <SystemIcon name="mobile" className="h-5 w-5 text-cyan-200" />
                </div>

                {notifications.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/45 p-6 text-center">
                        <SystemIcon name="bell" className="mx-auto h-8 w-8 text-slate-600" />
                        <div className="mt-4 text-sm font-semibold text-slate-200">No notifications yet</div>
                        <div className="mt-2 text-xs text-slate-500">Alerts will appear here when approved</div>
                    </div>
                ) : (
                    <div className="mt-6 space-y-3">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id}
                                className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="text-sm font-semibold text-slate-100">{notification.title}</div>
                                            {notification.severity && (
                                                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                                                    {notification.severity}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-2 text-sm text-slate-400">{notification.body}</div>
                                    </div>
                                    <div className="text-right text-xs text-slate-500">
                                        <div>{notification.time}</div>
                                        {notification.zone && <div className="mt-1">{notification.zone}</div>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

export default UserMobileView;
