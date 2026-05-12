// socket.js
let io = null;

function init(server) {
  const socketIo = require('socket.io')(server, {
    cors: {
      origin: '*',
      credentials: true,
    },
  });
  io = socketIo;
  console.log('Socket.io initialized');
}

function getIo() {
  return io;
}

module.exports = { init, getIo };
