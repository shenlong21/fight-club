import React, { useEffect, useRef } from 'react';

const GameCanvas = ({ gameState, connection, roomId }) => {
    const canvasRef = useRef(null);

    // Input handling
    useEffect(() => {
        if (!connection) return;

        const handleKeyDown = (e) => {
            // BUG FIX: Only check state when key is pressed, rather than evaluating it at component mount
            if (connection.state !== 'Connected') return;

            const key = e.key.toLowerCase();
            let action = null;
            if (key === 'a') action = 'left';
            if (key === 'd') action = 'right';
            if (key === 'j') action = 'punch';
            if (key === 'k') action = 'kick';

            if (action) {
                connection.invoke('HandleInput', roomId, action).catch(err => console.error(err));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [connection, roomId]);

    // Rendering loop
    useEffect(() => {
        if (!gameState || !gameState.players) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const render = () => {
            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw background (dark misty vibe)
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Floor
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(0, canvas.height - 50, canvas.width, 50);

            // Draw all players
            const players = Object.values(gameState.players);
            
            players.forEach(player => {
                const { x, y, health, isAttacking, attackType, direction, name, color } = player;

                // Health bar above head (dynamically floats with player since there are N players)
                ctx.fillStyle = 'red';
                ctx.fillRect(x - 30, y - 170, 60, 6);
                ctx.fillStyle = color || '#00f2fe';
                ctx.fillRect(x - 30, y - 170, (health / 100) * 60, 6);
                
                // Name above health bar
                ctx.fillStyle = 'white';
                ctx.font = '12px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText(name, x, y - 180);

                // Silhouette Rendering
                ctx.fillStyle = '#000000'; // Pure black for silhouette
                ctx.shadowColor = color || '#00f2fe'; // Glow effect
                ctx.shadowBlur = 20;

                ctx.save();
                ctx.translate(x, y);
                if (direction === -1) {
                    ctx.scale(-1, 1);
                }

                // Head
                ctx.beginPath();
                ctx.arc(0, -130, 20, 0, Math.PI * 2);
                ctx.fill();

                // Torso
                ctx.fillRect(-15, -110, 30, 60);

                // Legs
                ctx.fillRect(-15, -50, 10, 50); // back leg
                ctx.fillRect(5, -50, 10, 50);  // front leg

                // Arms / Attacks
                if (isAttacking && attackType === 'punch') {
                    ctx.fillRect(15, -100, 60, 12); // Extended punch
                } else {
                    ctx.fillRect(-5, -100, 10, 40); // Resting arm
                }

                if (isAttacking && attackType === 'kick') {
                    ctx.fillRect(15, -40, 60, 12); // Extended kick
                }

                ctx.restore();
                ctx.shadowBlur = 0;
            });
        };

        requestAnimationFrame(render);
    }, [gameState]);

    return (
        <canvas 
            ref={canvasRef} 
            width={800} 
            height={450} 
            style={{ 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '10px',
                background: 'linear-gradient(to bottom, #1a1a2e, #16213e)',
                display: 'block',
                margin: '0 auto',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }} 
        />
    );
};

export default GameCanvas;
