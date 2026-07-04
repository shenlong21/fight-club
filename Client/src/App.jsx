import { Routes, Route, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import GameCanvas from './GameCanvas';

function GameRoom() {
    const { roomId } = useParams();
    const location = useLocation();
    
    const [playerName] = useState(() => location.state?.playerName || `Fighter_${Math.floor(Math.random() * 10000)}`);

    const [connectionState, setConnectionState] = useState('connecting');
    const [statusText, setStatusText] = useState('Connecting to Arcade Server...');
    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState(null);
    const connectionRef = useRef(null);

    useEffect(() => {
        const newConnection = new signalR.HubConnectionBuilder()
            .withUrl('http://localhost:5190/gameHub')
            .withAutomaticReconnect()
            .build();
        
        connectionRef.current = newConnection;

        newConnection.on('PlayerJoined', (connectionId, joinedName) => {
            setPlayers(prev => {
                if (prev.some(p => p.id === connectionId)) return prev;
                return [...prev, { id: connectionId, name: joinedName }];
            });
        });

        newConnection.on('PlayerLeft', (connectionId, leftName) => {
            setPlayers(prev => prev.filter(p => p.id !== connectionId));
        });

        newConnection.on('GameStateUpdated', (state) => {
            setGameState(state);
        });

        const startConnection = async () => {
            try {
                await newConnection.start();
                const existingPlayers = await newConnection.invoke('JoinRoom', roomId, playerName);
                setPlayers(existingPlayers);
                setConnectionState('connected');
                setStatusText(`Connected as ${playerName}`);
            } catch (e) {
                setConnectionState('error');
                setStatusText('Connection Failed');
            }
        };

        startConnection();

        return () => {
            if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
                connectionRef.current.invoke('LeaveRoom', roomId)
                    .then(() => connectionRef.current.stop());
            } else {
                connectionRef.current?.stop();
            }
        };
    }, [roomId, playerName]);

    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            
            {/* Top Right Players List */}
            <div style={{ position: 'absolute', top: '20px', right: '20px', textAlign: 'right', background: 'rgba(0,0,0,0.6)', padding: '15px', borderRadius: '10px', border: '1px solid var(--secondary-color)', minWidth: '150px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: 'var(--secondary-color)', textTransform: 'uppercase' }}>Fighters in Arena</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.9rem' }}>
                    {players.length === 0 ? <li>Waiting...</li> : null}
                    {players.map(p => (
                        <li key={p.id} style={{ marginBottom: '5px' }}>
                            {p.name} {p.id === connectionRef.current?.connectionId ? '(You)' : ''}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="container" style={{ width: 'auto', padding: '30px' }}>
                <h1 className="title" style={{ fontSize: '2rem', marginBottom: '10px' }}>Arcade: {roomId}</h1>
                <div className={`status-badge status-${connectionState}`} style={{ marginBottom: '20px' }}>
                    {statusText}
                </div>

                <GameCanvas gameState={gameState} connection={connectionRef.current} roomId={roomId} />

                <p style={{ marginTop: '15px', color: '#ccc', fontSize: '0.9rem' }}>
                    <strong>Controls:</strong> [A] Left | [D] Right | [J] Punch | [K] Kick
                </p>
            </div>
        </div>
    );
}

function Home() {
    const navigate = useNavigate();
    const [nameInput, setNameInput] = useState('');

    const handleJoin = (e) => {
        e.preventDefault();
        const finalName = nameInput.trim() || `Shadow_${Math.floor(Math.random() * 9000) + 1000}`;
        navigate('/rooms/arena1', { state: { playerName: finalName } });
    };
    
    return (
        <div className="container">
            <h1 className="title">Fight Club</h1>
            <p style={{ marginBottom: '20px', color: '#ccc' }}>A tale of shadows and silhouettes.</p>
            
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                <input 
                    type="text" 
                    placeholder="Enter Fighter Name" 
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    style={{
                        padding: '12px 20px',
                        borderRadius: '30px',
                        border: '1px solid var(--secondary-color)',
                        background: 'rgba(0, 0, 0, 0.5)',
                        color: 'white',
                        fontSize: '1.1rem',
                        outline: 'none',
                        width: '250px',
                        textAlign: 'center',
                        fontFamily: 'Orbitron, sans-serif'
                    }}
                />
                <button type="submit" className="btn" style={{ width: '100%' }}>
                    Enter Arena 1
                </button>
            </form>
        </div>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/rooms/:roomId" element={<GameRoom />} />
        </Routes>
    );
}

export default App;
