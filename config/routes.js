module.exports = {
  rest:
  {
    '*': 'HomeController.index',
    'post /login': 'AuthController.post_login',
    'post /logout': 'AuthController.post_logout',
    'post /signup': 'AuthController.post_signup',
  },

  socket:
  {
    'connection': 'SocketController.connect'
  }
}
