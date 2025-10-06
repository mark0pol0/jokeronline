// Simple test script to verify socket connection
const socketIOClient = require('socket.io-client');

const socket = socketIOClient(process.env.SOCKET_TEST_URL || 'http://localhost:8080', {
  transports: ['websocket'],
  autoConnect: true,
  path: process.env.SOCKET_TEST_PATH || '/api/socket'
});

socket.on('connect', () => {
  console.log('Connected to server!');
  console.log('Socket ID:', socket.id);
  
  // Test room creation
  socket.emit('create-room', 'TestPlayer', (response) => {
    console.log('Create room response:', response);
    
    if (response.success) {
      console.log('Room created successfully with code:', response.roomCode);
    } else {
      console.error('Failed to create room:', response.error);
    }
    
    // Close connection after test
    socket.disconnect();
  });
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

console.log('Attempting to connect to socket server...'); 