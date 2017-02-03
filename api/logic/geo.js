'use strict'
const http = require('http')

module.exports = {
  geoNameToGeo: (name, callback) =>
  {
    if (!name) return callback(null)
    name = escape(name)

    http.get({
      host: 'maps.googleapis.com',
      path: `/maps/api/geocode/json?address=${name}&sensor=true`
    }, (res) =>
    {
      let body = ''
      res.on('data', (data) => body += data)
      res.on('end', () => callback(JSON.parse(body)))
    })
  }
}
