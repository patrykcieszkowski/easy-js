'use strict'
const bcrypt = require('bcrypt')
const moment = require('moment')
const async = require('async')

module.exports =
{
  post_login: (req, res) =>
  {
    let data = req.body
    if (!data.email || !data.password)
    {
      return res.sendStatus(401)
    }

    models.user.findOne({email_address: data.email}).lean()
      .exec((err, userFound) =>
    {
      if (err)
      {
        console.log("Error ", err)
        return res.sendStatus(400)
      }

      if (!userFound)
      {
        return res.status(401).send({error: 'Validation failed', validation: 'email'})
      }

      let passCheck = bcrypt.compareSync(data.password, userFound.password)
      if (!passCheck)
      {
        return res.status(401).send({error: 'Password doesn\'t match with email address', validation: 'password'})
      }

      logic.user.parseUser(userFound, true, (parsedUser) =>
      {
        logic.user.createJWTToken({
          claims: {user: parsedUser}
        }, (err, token) =>
        {
          if (err)
          {
            return res.sendStatus(400)
          }

          return res.status(200).send({token: token})
        })
      })
    })
  },

  post_logout: (req, res) =>
  {
    let data = req.body
    let token = data.auth_token
    if (!token)
    {
      return res.status(400).json({error: 'missing jwt token'})
    }

    logic.user.destroyJWTToken(token, (err) =>
    {
      return res.sendStatus(200)
    })
  },

  post_signup: (req, res) =>
  {
    let data = req.body
    let userDetails = {
      first_name: data.first_name,
      last_name: data.last_name,
      email_address: data.email,
      password: bcrypt.hashSync(data.password, bcrypt.genSaltSync(10)),
      settings: {
        sounds: true,
        notifications: false,
        show_status: true,
        show_emoticons: true
      },
    }

    async.series([
      function(series_cb)
      {
        if (!data.first_name || !data.last_name
            || !data.email || !data.password)
        {
          return res.sendStatus(400)
        }

        return series_cb()
      },
      function(series_cb)
      {
        let _validation = [
          {field: 'password', value: logic.assets.verifyPassword(data.password)},
          {field: 'email', value: logic.assets.verifyEmail(data.email)}
        ].filter((_item) => !_item.value)

        if (_validation.length > 0)
        {
          return res.status(401).send({error: 'Validation failed', validation: _validation[0].field})
        }

        return series_cb()
      },
      function(series_cb)
      {
        models.user.findOne({ email_address: data.email })
          .exec((err, userFound) =>
        {
          if (err || userFound)
          {
            return res.status(401).send({error: 'Email is already in use', validation: 'email'})
          }

          return series_cb()
        })
      },
      function(series_cb)
      {
        if (!data.location) return series_cb()
        logic.geo.geoNameToGeo(data.location, (data) =>
        {
          if (!data || !data.results || data.results.length < 1) return series_cb()
          let loc = data.results[0]
          userDetails.geo = {name: loc.formatted_address, code: loc.place_id}

          return series_cb()
        })
      }
    ], () =>
    {
      models.user.create(userDetails, (err, userCreated) =>
      {
        if (err || !userCreated)
        {
          console.error(err)
          return res.sendStatus(401)
        }

        logic.user.parseUser(userCreated, true, (parsedUser) =>
        {
          logic.user.createJWTToken({
            claims: {user: parsedUser}
          }, (err, token) =>
          {
            if (err)
            {
              return res.sendStatus(400)
            }

            return res.status(200).json({token: token})
          })
        })
      })
    })
  },
}
