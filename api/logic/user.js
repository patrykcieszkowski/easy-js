'use strict'
const moment = require('moment')
const _ = require('lodash')
const jwt = require('jsonwebtoken')
const uuid = require('node-uuid')
const async = require('async')

module.exports =
{
  verifyJWTToken: (token, callback) =>
  {
    if (!token)
    {
      return callback(null, null)
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decodedToken) =>
    {
      if (err || !decodedToken.jti)
      {
        return callback(err, null, null)
      }

      let prefix = (decodedToken.user._id) ? decodedToken.user._id.toString()+':' : ''

      global.redisClient.get(prefix+decodedToken.jti, (err, session) =>
      {
        if (session)
        {
          session = JSON.parse(session)
        }

        return callback(null, session, decodedToken)
      })
    })
  },

  createJWTToken: (details, callback) =>
  {
    if (typeof details !== 'object')
    {
      details = {}
    }

    if (!details.maxAge || typeof details.maxAge !== 'number')
    {
      details.maxAge = 86400
    }

    details.sessionData = _.reduce(details.sessionData || {}, (memo, val, key) =>
    {
      if (typeof val !== "function" && key !== "id")
      {
        memo[key] = val
      }

      return memo
    }, {})

    let prefix = (details.claims.user._id) ? details.claims.user._id.toString()+':' : ''

    let sess_id = uuid.v4()
    let token = jwt.sign(_.extend({jti: sess_id}, details.claims || {}), process.env.JWT_SECRET, {algorithm: 'HS256'})
    global.redisClient.setex(prefix+sess_id, details.maxAge, JSON.stringify(details.sessionData), (err) =>
    {
      return callback(err, token)
    })
  },

  destroyJWTToken: (token, callback) =>
  {
    logic.user.verifyJWTToken(token, (err, session, decodedToken) =>
    {
      if (err || !session)
      {
        return callback(err)
      }

      let prefix = (decodedToken.user._id) ? decodedToken.user._id.toString()+':' : ''

      global.redisClient.del(prefix+decodedToken.jti, callback)
    })
  },

  parseUser: (userFound, privateBool, callback) =>
  {
    delete userFound.password
    if (userFound.settings)
    {
      userFound.online = (!userFound.settings.show_status) ? false : userFound.online
    }

    if (userFound.phone)
    {
      if (userFound.phone.code
        && userFound.phone.number)
      {
        userFound.phone.full = logic.assets.formatPhoneNumber(userFound.phone)
      }
      else
      {
        userFound.phone = {}
      }
    }

    // if (!userFound.image_url)
    // {
    //   userFound.image_url = process.env.ASSETS_URL+'noavatar.png'
    // }

    if (!privateBool)
    {
      delete userFound.phone
      delete userFound.settings
      delete userFound.email
      delete userFound.active_chat
    }

    userFound.createdAt = moment(userFound.createdAt).format("Do MMMM, YYYY")
    return callback(userFound)
  },

  updateStatus: (user_id, statusBool) =>
  {
    if (!user_id || typeof statusBool == 'undefined') return
    models.user.update({_id: user_id}, {online: statusBool}).exec()
  },

  updateSettingsBools: (user_id, key, value, callback) =>
  {
    let allowedKeys = ['sounds', 'notifications', 'show_status', 'show_emoticons']
    if (!key || !allowedKeys.includes(key) || typeof value !== 'boolean')
    {
      return callback(null)
    }

    let updateQuery = {}
    updateQuery['settings.'+key] = value
    models.user.update({_id: user_id}, updateQuery)
      .exec((err, userUpdated) =>
    {
      if (err) return callback(null)
      return callback(userUpdated)
    })
  },

  updateSettingsPhoneNumber: (user_id, code, number, callback) =>
  {
    if (!code || !number) return callback(null)
    let phoneObj = {code: code.toString(), number: number.toString()}
    models.user.update({_id: user_id}, {phone: phoneObj})
      .exec((err, userUpdated) =>
    {
      if (err) return callback(null)
      phoneObj.full = logic.assets.formatPhoneNumber(phoneObj)
      return callback(phoneObj)
    })
  },

  updateSettingsName: (user_id, first_name, last_name, callback) =>
  {
    if (!first_name || !last_name) return callback(null)
    models.user.update({_id: user_id}, {first_name: first_name, last_name: last_name})
      .exec((err, userUpdated) =>
    {
      if (err) return callback(null)
      return callback(userUpdated)
    })
  },

  fetchUser: (user_id, myselfBool, callback) =>
  {
    models.user.findOne({ _id: user_id }).lean()
      .exec((err, userFound) =>
    {
      if (err || !userFound) return callback(null)
      logic.user.parseUser(userFound, myselfBool, (parsedUser) =>
      {
        return callback(parsedUser)
      })
    })
  },

  fetchSearch: (location, name, online, gender, page, callback) =>
  {
    let baseQuery = {}, queryList = []
    if (online) baseQuery['document.online'] = online
    if (gender) baseQuery['document.gender'] = Number(gender)
    if (!page) page = 1
    name = name.toLowerCase()

    let limit = 10
    let skip = (page-1)*limit

    async.series([
      function(cb)
      {
        if (!location) return cb()
        logic.geo.geoNameToGeo(location, (data) =>
        {
          if (!data || !data.results || data.results.length < 1) return cb()
          let loc = data.results[0]
          location = {name: loc.formatted_address, id: loc.place_id}
          baseQuery['document.geo.code'] = location.id

          return cb()
        })
      },
      function(cb)
      {
        queryList = [
          Object.assign({}, baseQuery, { 'name_match.full_order.first': name }),
          Object.assign({}, baseQuery, { 'name_match.full_order.last': name }),
          Object.assign({}, baseQuery, { 'name_match.first_name': name }),
          Object.assign({}, baseQuery, { 'name_match.last_name': name }),
          Object.assign({}, baseQuery, { 'email': name })
        ]

        return cb()
      }
    ], () =>
    {
      models.user.aggregate([
        { $project: {
            name_match: {
              full_order: {
                first: { $toLower: {$concat:['$first_name', ' ', '$last_name']} },
                last: { $toLower: {$concat:['$last_name', ' ', '$first_name']} }
              },
              first_name: {$toLower: '$first_name' },
              last_name: {$toLower: '$last_name'}
            },
            email: {$toLower: '$email_address'},
            document: "$$ROOT"
          }
        },
        { $match: { $or: queryList } },
        { $limit: limit },
        { $skip: skip },
      ])
        .exec((err, resultFound) =>
      {
        return callback(resultFound)
      })
    })
  }
}
