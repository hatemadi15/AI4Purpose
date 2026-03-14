import { useState, useEffect } from 'react';
import { getUsers, subscribeUser, getVapidPublicKey } from '../services/api';
import useSocket from '../hooks/useSocket';

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
        if (socket && selectedUser) {
            socket.on('user_alert', (data) => {
                if (data.userId && String(data.userId) !== String(selectedUser.id)) {
                    return;
                }
                const notification = {
                    id: Date.now(),
                    title: `⚠️ ${data.alert?.event_type || 'Alert'}`,
                    body: data.message || `Alert for ${data.alert?.region || 'your area'}`,
                    time: new Date().toLocaleTimeString(),
                    severity: data.alert?.severity,
                    zone: data.zone
                };
                setNotifications(prev => [notification, ...prev]);
            });

            return () => {
                socket.off('user_alert');
            };
        }
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
            // Check if notifications are supported
            if (!('Notification' in window)) {
                throw new Error('Push notifications not supported in this browser');
            }

            // Request permission
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                throw new Error('Notification permission denied');
            }

            // Register service worker
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            await navigator.serviceWorker.ready;

            // Get VAPID public key
            const vapidResponse = await getVapidPublicKey();
            const vapidPublicKey = vapidResponse.data.publicKey;

            if (!vapidPublicKey) {
                throw new Error('VAPID public key not configured');
            }

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
            });

            // Save subscription to backend
            await subscribeUser(selectedUser.id, subscription.toJSON());

            setSubscriptionStatus('enabled');

            // Update local user data
            setSelectedUser(prev => ({
                ...prev,
                push_subscription: subscription.toJSON()
            }));

            // Show success notification
            new Notification('MedAlert Notifications Enabled', {
                body: 'You will now receive crisis alerts',
                icon: '/favicon.svg'
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
            <div className="max-w-md mx-auto flex items-center justify-center h-96">
                <div className="text-slate-400">Loading...</div>
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="text-5xl mb-4">📱</div>
                <h1 className="text-2xl font-bold text-white mb-2">User Mobile View</h1>
                <p className="text-slate-400">Receive push notifications for crisis alerts</p>
            </div>

            {/* User Selector */}
            <div className="glass-card p-4 mb-6">
                <label className="text-sm text-slate-300 mb-2 block">Select Demo User</label>
                <select
                    value={selectedUser?.id || ''}
                    onChange={(e) => {
                        const user = users.find(u => u.id === parseInt(e.target.value));
                        setSelectedUser(user);
                    }}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                    {users.map(user => (
                        <option key={user.id} value={user.id}>
                            {user.name} ({user.preferred_language?.toUpperCase()})
                        </option>
                    ))}
                </select>
            </div>

            {/* User Info Card */}
            {selectedUser && (
                <div className="glass-card p-4 mb-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg">
                            {selectedUser.name?.charAt(0)}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-white font-semibold">{selectedUser.name}</h3>
                            <p className="text-sm text-slate-400">{selectedUser.email}</p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                <span>📍 {parseFloat(selectedUser.lat).toFixed(4)}, {parseFloat(selectedUser.lon).toFixed(4)}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-400 mb-1">Language</div>
                            <div className="px-2 py-1 bg-slate-700 rounded text-sm text-white">
                                {selectedUser.preferred_language?.toUpperCase()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Notification Enable Button */}
            <div className="glass-card p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-white font-semibold">Push Notifications</h3>
                        <p className="text-sm text-slate-400">Receive real-time crisis alerts</p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${subscriptionStatus === 'enabled'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                        <div className={`w-2 h-2 rounded-full ${subscriptionStatus === 'enabled' ? 'bg-green-400' : 'bg-slate-500'
                            }`}></div>
                        <span className="text-sm">
                            {subscriptionStatus === 'enabled' ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                </div>

                {subscriptionStatus !== 'enabled' && (
                    <button
                        onClick={enableNotifications}
                        disabled={subscribing}
                        className="w-full py-4 rounded-xl glow-button text-white font-bold text-lg transition-all disabled:opacity-50"
                    >
                        {subscribing ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Enabling...
                            </span>
                        ) : (
                            <span className="flex items-center justify-center gap-2">
                                🔔 Enable Notifications
                            </span>
                        )}
                    </button>
                )}

                {subscriptionStatus === 'enabled' && (
                    <div className="text-center text-green-400 py-2">
                        ✅ You will receive push notifications for alerts in your area
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                        {error}
                    </div>
                )}
            </div>

            {/* Connection Status */}
            <div className="glass-card p-4 mb-6">
                <div className="flex items-center justify-between">
                    <span className="text-slate-400">Real-time Connection</span>
                    <div className={`flex items-center gap-2 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </div>
                </div>
            </div>

            {/* Notification History */}
            <div className="glass-card p-4">
                <h3 className="text-white font-semibold mb-4">Notification History</h3>

                {notifications.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-4xl mb-2">🔕</div>
                        <p className="text-slate-400">No notifications yet</p>
                        <p className="text-xs text-slate-500 mt-2">
                            Alerts will appear here when approved
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map(notif => (
                            <div
                                key={notif.id}
                                className="p-3 bg-slate-800/50 rounded-lg border-l-4 border-primary-500"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-white font-medium">{notif.title}</span>
                                    <span className="text-xs text-slate-500">{notif.time}</span>
                                </div>
                                <p className="text-sm text-slate-400">{notif.body}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="mt-6 text-center text-xs text-slate-500">
                <p>This simulates a mobile user receiving crisis alerts.</p>
                <p className="mt-1">Enable notifications and approve an alert to test.</p>
            </div>
        </div>
    );
}

export default UserMobileView;
