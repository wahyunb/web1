document.addEventListener('DOMContentLoaded', () => {
    // Connect to Socket.IO
    const socket = io();
    
    // DOM Elements
    const joinForm = document.getElementById('join-form');
    const createGameBtn = document.getElementById('create-game');
    
    // Join form submit
    joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const gameId = document.getElementById('game-id').value.trim();
        const username = document.getElementById('username').value.trim();
        
        if (!gameId || !username) {
            alert('Please enter both Game ID and your name.');
            return;
        }
        
        // Store game info in sessionStorage
        sessionStorage.setItem('gameId', gameId);
        sessionStorage.setItem('username', username);
        
        // Redirect to player page
        window.location.href = '/player.html';
    });
    
    // Create game button click
    createGameBtn.addEventListener('click', () => {
        // Redirect to host page
        window.location.href = '/host.html';
    });
});