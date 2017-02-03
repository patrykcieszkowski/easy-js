'use strict'
const async = require('async')
const ObjectId = require('mongoose').Types.ObjectId
const moment = require('moment')

let conversation = module.exports =
{
  findUserConvId: (user_id, callback) =>
  {
    let convIdList = []
    if (!user_id) return callback(convIdList)
    models.conversations.find({members: user_id}).lean()
      .exec((err, consFound) =>
    {
      if (err) console.error(err)
      if (!err && consFound.length > 0)
      {
        convIdList = consFound.map((k) => { return k._id.toString() })
      }

      return callback(convIdList)
    })
  },

  findSingleConvByMembersId: (userList, callback) =>
  {
    userList = userList.map((user) => (typeof user == 'string') ? ObjectId(user) : user )
    if (!userList || userList.length < 2) return callback(null)
    models.conversations.findOne({ "$and": [ { "members": { "$all": userList }}, { "members": { "$size": 2 } } ]}).lean()
      .exec((err, convFound) =>
    {
      if (err || !convFound) return callback(null)
      return callback(convFound)
    })
  },

  parseConversation: (convObj, eventsBool, fetchConvMembers, callback) =>
  {
    async.series([
      function(seriesCb)
      {
        if (!fetchConvMembers) return seriesCb()
        async.forEachOf(convObj.members, (value, key, cb) =>
        {
          models.user.findOne({ _id: value }).lean()
            .exec((err, userFound) =>
          {
            if (err || !userFound) return cb()
            logic.user.parseUser(userFound, false, (parsedUser) =>
            {
              convObj.members[key] = parsedUser
              convObj.name = parsedUser.first_name+' '+parsedUser.last_name
              return cb()
            })
          })
        }, seriesCb)
      },
      function(seriesCb)
      {
        if (!eventsBool) return seriesCb()
        conversation.findRecentEvents(convObj._id.toString(), (foundEvents) =>
        {
          convObj.events = foundEvents
          return seriesCb()
        })
      },
    ], () =>
    {
      return callback(convObj)
    })
  },

  createConv: (userList, callback) =>
  {
    let members = userList.map((user) => (typeof user === 'string') ? ObjectId(user) : user )
    models.conversations.create({members: members}, (err, convCreated) =>
    {
      if (err || !convCreated) return callback(null)
      return callback(convCreated.toObject())
    })
  },

  findConversation: (conv_id, eventsBool, callback, user_id, fetchConvMembers) =>
  {
    if (!conv_id) return callback(null)
    let query = { _id: conv_id }
    if (user_id) query.members = user_id

    models.conversations.findOne(query).lean()
      .exec((err, convFound) =>
    {
      if (err || !convFound) return callback(null)

      conversation.parseConversation(convFound, eventsBool, fetchConvMembers, (parsedConv) =>
      {
        return callback(parsedConv)
      })
    })
  },

  findRecentEvents: (conv_id, callback) =>
  {
    let eventList = []
    if (!conv_id) return callback(eventList)

    models.conversation_events.find({ conv_id: conv_id }).sort('-_id').limit(25)
      .exec((err, eventsFound) =>
    {
      if (err || eventsFound.length < 1) return callback(eventList)
      eventsFound = eventsFound.reverse()
      async.timesLimit(eventsFound.length, 1, (n, next) =>
      {
        let _event = eventsFound[n]
        conversation.parseConversationEvent(_event, (parsedResult) =>
        {
          eventList.push(parsedResult)
          return next()
        })
      }, () =>
      {
        return callback(eventList)
      })
    })
  },

  parseConversationEvent: (dbResult, callback) =>
  {
    let result = dbResult.toJSON()
    result.user_id = result.user_id.toString()
    result.conv_id = result.conv_id.toString()
    result.date = {
      fromNow: moment(result.createdAt).fromNow(true),
      hour: moment(result.createdAt).format("h:mm a"),
      full: moment(result.createdAt).format("dddd, Do MMM YYYY, h:mm a"),
      weekDayHour: moment(result.createdAt).format("dddd, h:mm a"),
    }
    result.seen = result.seen || []

    return callback(result)
  },

  createConvEvent: (user_id, conv_id, content, type, callback) =>
  {
    models.conversations.findOne({_id: conv_id, members: user_id}).lean()
      .exec((err, convFound) =>
    {
      if (err || !convFound) return callback(null)
      let convMembers = convFound.members.map((user) => user.toString())

      let query = { user_id: user_id, conv_id: conv_id, type: type, content: content }
      models.conversation_events.create(query, (err, eventCreated) =>
      {
        if (err || !eventCreated) return callback(null)
        logic.conversation.parseConversationEvent(eventCreated, (parsedResult) =>
        {
          return callback(parsedResult, convMembers)
        })
      })
    })
  },

  fetchConversationByMemberIds: (userList, callback) =>
  {
    let fetchedConv = null
    logic.conversation.findSingleConvByMembersId(userList, (conv) =>
    {
      fetchedConv = conv

      async.series([
        function(cb)
        {
          if (fetchedConv) return cb()
          logic.conversation.createConv(userList, (convCreated) =>
          {
            async.forEachOf(global.io.sockets.sockets, (socketUser, socketKey, socketCb) =>
            {
              if (socketUser.db_id && userList.indexOf(socketUser.db_id) > -1)
              {
                socketUser.join(convCreated._id.toString())
              }
              return socketCb()
            }, () =>
            {
              fetchedConv = convCreated
              return cb()
            })
          })
        },
        function(cb)
        {
          if (!fetchedConv) return cb()
          logic.conversation.parseConversation(fetchedConv, true, false, (parsedConv) =>
          {
            fetchedConv = parsedConv
            return cb()
          })
        }
      ], () =>
      {
        return callback(fetchedConv)
      })
    })
  }
}
